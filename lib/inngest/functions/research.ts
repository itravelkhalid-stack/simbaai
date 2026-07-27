import { runResearchClaudeAgent } from "@/lib/agents/research/runner";
import {
  appendAgentRunLog,
  markResearchFailed,
  persistResearchReport,
} from "@/lib/agents/research/persist";
import { inngest } from "@/lib/inngest/client";
import { recordJobFailure } from "@/lib/inngest/functions/jobs";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ResearchProjectType } from "@/lib/types/research";

export const runResearchProject = inngest.createFunction(
  {
    id: "research/run-project",
    retries: 1,
    triggers: [{ event: "research/run.requested" }],
  },
  async ({ event, step }) => {
    const { projectId, agentRunId } = event.data as {
      projectId: string;
      agentRunId: string;
    };

    const startedAt = Date.now();
    const supabase = createAdminClient();

    try {
      const context = await step.run("load-context", async () => {
        const { data: project, error } = await supabase
          .from("research_projects")
          .select("*")
          .eq("id", projectId)
          .single();

        if (error || !project) {
          throw new Error(error?.message ?? "Research project not found");
        }

        const { data: brand, error: brandError } = await supabase
          .from("brands")
          .select("*")
          .eq("id", project.brand_id)
          .single();

        if (brandError || !brand) {
          throw new Error(brandError?.message ?? "Brand not found");
        }

        const { data: org, error: orgError } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", project.organization_id)
          .single();

        if (orgError || !org) {
          throw new Error(orgError?.message ?? "Organization not found");
        }

        let priorResearchMarkdown: string | null = null;
        if (project.refreshed_from_id) {
          const { data: priorDocs } = await supabase
            .from("research_documents")
            .select("section, content")
            .eq("project_id", project.refreshed_from_id)
            .order("sort_order", { ascending: true });

          priorResearchMarkdown = (priorDocs ?? [])
            .map((doc) => `## ${doc.section}\n\n${doc.content}`)
            .join("\n\n");
        }

        await supabase
          .from("research_projects")
          .update({ status: "running" })
          .eq("id", projectId);

        await supabase
          .from("agent_runs")
          .update({ status: "running", progress: 1 })
          .eq("id", agentRunId);

        await appendAgentRunLog(agentRunId, "Loaded brand and organization context", 10);

        const brief = project.brief as {
          notes?: string;
          competitorUrls?: string[];
          discoverTop5?: boolean;
          model?: string;
        };

        return {
          project,
          brand,
          organizationName: org.name,
          priorResearchMarkdown,
          brief,
        };
      });

      const result = await step.run("run-claude-agent", async () => {
        return runResearchClaudeAgent({
          type: context.project.type as ResearchProjectType,
          model: context.brief.model,
          context: {
            organizationName: context.organizationName,
            brandName: context.brand.name,
            website: context.brand.website,
            positioning: context.brand.positioning,
            brandVoice: context.brand.brand_voice,
            targetAudience: context.brand.target_audience,
            socialHandles: context.brand.social_handles,
            priorResearchMarkdown: context.priorResearchMarkdown,
            brief: context.brief.notes ?? context.project.title,
            competitorUrls: context.brief.competitorUrls ?? [],
            discoverTop5: context.brief.discoverTop5 ?? true,
          },
          onProgress: async ({ message, progress }) => {
            await appendAgentRunLog(agentRunId, message, progress);
          },
        });
      });

      await step.run("persist-report", async () => {
        await appendAgentRunLog(agentRunId, "Saving report to research library", 95);
        await persistResearchReport({
          organizationId: context.project.organization_id,
          projectId,
          runId: agentRunId,
          report: result.report,
          model: result.model,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costPence: result.costPence,
          durationMs: Date.now() - startedAt,
        });
      });

      return { ok: true, projectId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Research run failed";
      await markResearchFailed({ projectId, runId: agentRunId, error: message });
      await recordJobFailure({
        provider: "inngest",
        jobName: "research/run-project",
        eventName: "research/run.requested",
        error: message,
        agentRunId,
        payload: { projectId },
      });
      throw error;
    }
  },
);

export const researchFunctions = [runResearchProject];
