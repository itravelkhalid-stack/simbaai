import "server-only";

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const STUCK_MS = 2 * 60 * 60 * 1000;
const DRAIN_BATCH = 40;

type QueuedRun = {
  id: string;
  organization_id: string;
  agent_name: string;
  status: string;
  progress: number | null;
  input: Record<string, unknown> | null;
  research_project_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Drain queued Inngest-backed runs and finalize zombies.
 * Event names match listeners in app/api/inngest/route.ts exactly.
 */
export async function sweepAgentRuns() {
  const supabase = createAdminClient();
  const now = Date.now();
  const stuckCutoff = new Date(now - STUCK_MS).toISOString();

  const drained = await drainQueued(supabase);
  const healed = await healCompletedButStuck(supabase);
  const failed = await failStuckRunning(supabase, stuckCutoff);

  return { drained, healed, failed };
}

async function drainQueued(
  supabase: ReturnType<typeof createAdminClient>,
) {
  const { data } = await supabase
    .from("agent_runs")
    .select(
      "id, organization_id, agent_name, status, progress, input, research_project_id, created_at, updated_at",
    )
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(DRAIN_BATCH);

  const results: Array<{ id: string; action: string }> = [];

  for (const raw of data ?? []) {
    const run = raw as QueuedRun;
    const input = (run.input ?? {}) as Record<string, unknown>;

    try {
      const { isBrandAgentHalted, resolveBrandIdForAgentRun } = await import(
        "@/lib/brand/agent-halt"
      );
      const brandId = await resolveBrandIdForAgentRun({
        organizationId: run.organization_id,
        agentName: run.agent_name,
        input,
        researchProjectId: run.research_project_id,
      });
      if (
        brandId &&
        (await isBrandAgentHalted({
          organizationId: run.organization_id,
          brandId,
        }))
      ) {
        await markFailed(
          supabase,
          run.id,
          "Brand agent activity paused — drain skipped to prevent Claude spend",
        );
        results.push({ id: run.id, action: "skipped_brand_halted" });
        continue;
      }

      if (run.agent_name === "media_vision_tag") {
        const mediaAssetId = String(input.mediaAssetId ?? "");
        const brandId = String(input.brandId ?? "");
        if (!mediaAssetId) {
          await markFailed(supabase, run.id, "Missing mediaAssetId in input");
          results.push({ id: run.id, action: "failed_bad_input" });
          continue;
        }
        // Process inline — more reliable than re-emit when events were lost.
        const { tagMediaAssetWithVision } = await import("@/lib/media/tag");
        await tagMediaAssetWithVision({
          organizationId: run.organization_id,
          mediaAssetId,
          agentRunId: run.id,
        });
        results.push({ id: run.id, action: "tagged_inline" });
        continue;
      }

      if (run.agent_name === "brand_guidelines_pdf") {
        const mediaAssetId = String(input.mediaAssetId ?? "");
        const brandId = String(input.brandId ?? "");
        if (!mediaAssetId || !brandId) {
          await markFailed(supabase, run.id, "Missing brandId/mediaAssetId");
          results.push({ id: run.id, action: "failed_bad_input" });
          continue;
        }
        await inngest.send({
          name: "brand/guidelines.pdf.ingest",
          data: {
            organizationId: run.organization_id,
            brandId,
            mediaAssetId,
            agentRunId: run.id,
          },
        });
        results.push({ id: run.id, action: "reemitted_guidelines" });
        continue;
      }

      if (
        [
          "brand_audit",
          "competitor",
          "market",
          "keyword",
          "audience",
          "trend",
        ].includes(run.agent_name)
      ) {
        let projectId = run.research_project_id;
        if (!projectId) {
          const { data: project } = await supabase
            .from("research_projects")
            .select("id")
            .eq("latest_agent_run_id", run.id)
            .maybeSingle();
          projectId = project?.id ?? null;
        }
        if (!projectId) {
          await markFailed(
            supabase,
            run.id,
            "No research_project linked; cannot re-emit",
          );
          results.push({ id: run.id, action: "failed_no_project" });
          continue;
        }
        await inngest.send({
          name: "research/run.requested",
          data: { projectId, agentRunId: run.id },
        });
        results.push({ id: run.id, action: "reemitted_research" });
        continue;
      }

      // Unknown queued agents — leave for manual / DLQ after age.
      if (new Date(run.created_at).getTime() < Date.now() - STUCK_MS) {
        await markFailed(
          supabase,
          run.id,
          "Queued >2h with no drain handler for this agent_name",
        );
        results.push({ id: run.id, action: "failed_aged_unknown" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(supabase, run.id, `Drain failed: ${message}`);
      results.push({ id: run.id, action: "failed_drain_error" });
    }
  }

  return results;
}

/** Fix runs that finished work but never left status=running. */
async function healCompletedButStuck(
  supabase: ReturnType<typeof createAdminClient>,
) {
  const healed: Array<{ id: string; reason: string }> = [];

  // Research: project complete + run still running
  const { data: researchRuns } = await supabase
    .from("agent_runs")
    .select("id, research_project_id, progress")
    .eq("status", "running")
    .eq("module", "research")
    .gte("progress", 90)
    .limit(50);

  for (const run of researchRuns ?? []) {
    if (!run.research_project_id) continue;
    const { data: project } = await supabase
      .from("research_projects")
      .select("status")
      .eq("id", run.research_project_id)
      .maybeSingle();
    if (project?.status === "complete") {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          error: null,
        })
        .eq("id", run.id);
      healed.push({ id: run.id, reason: "research_project_complete" });
    }
  }

  // Content batch: items exist for this run but status still running
  const { data: batchRuns } = await supabase
    .from("agent_runs")
    .select("id")
    .eq("status", "running")
    .eq("agent_name", "content_batch_generate")
    .limit(20);

  for (const run of batchRuns ?? []) {
    const { count } = await supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("agent_run_id", run.id);
    if ((count ?? 0) > 0) {
      const input = (
        await supabase
          .from("agent_runs")
          .select("input")
          .eq("id", run.id)
          .single()
      ).data?.input as { planId?: string } | null;
      if (input?.planId) {
        await supabase
          .from("content_plans")
          .update({ status: "complete" })
          .eq("id", input.planId)
          .eq("status", "generating");
      }
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          error: null,
        })
        .eq("id", run.id);
      healed.push({
        id: run.id,
        reason: `content_batch_items=${count}`,
      });
    }
  }

  return healed;
}

async function failStuckRunning(
  supabase: ReturnType<typeof createAdminClient>,
  stuckCutoff: string,
) {
  const { data } = await supabase
    .from("agent_runs")
    .select("id, agent_name, updated_at, created_at")
    .eq("status", "running")
    .lt("updated_at", stuckCutoff)
    .limit(50);

  const failed: string[] = [];
  for (const run of data ?? []) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        progress: 100,
        error: `Sweeper: stuck in running >2h (last update ${run.updated_at})`,
      })
      .eq("id", run.id)
      .eq("status", "running");
    failed.push(run.id);
  }
  return failed;
}

async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
  error: string,
) {
  await supabase
    .from("agent_runs")
    .update({ status: "failed", progress: 100, error })
    .eq("id", id);
}
