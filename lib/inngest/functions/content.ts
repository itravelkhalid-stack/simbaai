import { getBrandContext } from "@/lib/brand/context";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";
import {
  generateBatchPlan,
  generateRepurposeAdaptations,
  generateScriptContent,
  generateSinglePostVariants,
  isScriptFormat,
} from "@/lib/agents/content/generate";
import { appendAgentRunLog } from "@/lib/agents/research/persist";
import { runEntityComplianceCheck } from "@/lib/compliance/check";
import { inngest } from "@/lib/inngest/client";
import { recordJobFailure } from "@/lib/inngest/functions/jobs";
import { autoAttachLibraryImage } from "@/lib/media/select";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ContentFormat,
  ContentPlatform,
} from "@/lib/types/content";

async function applyComplianceToItem(params: {
  organizationId: string;
  brandId: string;
  itemId: string;
  platform: ContentPlatform;
  format: ContentFormat;
  copy: string;
  hashtags: string[];
  structured: Record<string, unknown>;
  title?: string | null;
}) {
  await runEntityComplianceCheck({
    organizationId: params.organizationId,
    brandId: params.brandId,
    entityType: "content",
    entityId: params.itemId,
    title: params.title ?? null,
    body: params.copy,
    extra: {
      platform: params.platform,
      format: params.format,
      hashtags: params.hashtags,
      structured: params.structured,
    },
    syncContentFlags: true,
  });
}

async function maybeAutoAttachMedia(params: {
  organizationId: string;
  brandId: string;
  itemId: string;
  topic: string;
  title?: string | null;
  copy?: string | null;
}) {
  try {
    await autoAttachLibraryImage({
      organizationId: params.organizationId,
      brandId: params.brandId,
      contentItemId: params.itemId,
      topic: params.topic,
      title: params.title,
      copy: params.copy,
    });
  } catch {
    // Suggestion only — generation must not fail if library is empty/misconfigured
  }
}

export const runContentSingleGenerate = inngest.createFunction(
  {
    id: "content/generate-single",
    retries: 1,
    triggers: [{ event: "content/generate.single" }],
  },
  async ({ event, step }) => {
    const {
      organizationId,
      brandId,
      agentRunId,
      platform,
      format,
      pillarId,
      topic,
      rejectionReason,
      model,
      createdBy,
      sourceItemId,
    } = event.data as {
      organizationId: string;
      brandId: string;
      agentRunId: string;
      platform: ContentPlatform;
      format: ContentFormat;
      pillarId?: string;
      topic: string;
      rejectionReason?: string;
      model?: string;
      createdBy: string;
      sourceItemId?: string;
    };

    const supabase = createAdminClient();
    const started = Date.now();

    try {
      await step.run("mark-running", async () => {
        await supabase
          .from("agent_runs")
          .update({ status: "running", progress: 5 })
          .eq("id", agentRunId);
        await appendAgentRunLog(agentRunId, "Loading brand context", 10);
      });

      const brandContext = await step.run("brand-context", async () => {
        return getBrandContext(organizationId, brandId, { admin: true });
      });

      const pillarName = pillarId
        ? brandContext.pillars.find((p) => p.id === pillarId)?.name
        : null;

      const generated = await step.run("generate", async () => {
        await appendAgentRunLog(agentRunId, "Generating content with Claude", 30);
        if (isScriptFormat(format)) {
          const result = await generateScriptContent({
            brandContext,
            platform,
            format,
            pillarName,
            topic,
            rejectionReason,
            model,
          });
          return {
            kind: "script" as const,
            result,
          };
        }
        const result = await generateSinglePostVariants({
          brandContext,
          platform,
          format,
          pillarName,
          topic,
          rejectionReason,
          model,
        });
        return { kind: "variants" as const, result };
      });

      const itemIds = await step.run("persist-items", async () => {
        await appendAgentRunLog(agentRunId, "Saving drafts + compliance checks", 70);
        const variantGroupId = crypto.randomUUID();
        const ids: string[] = [];

        if (generated.kind === "script") {
          const { data: item, error } = await supabase
            .from("content_items")
            .insert({
              organization_id: organizationId,
              brand_id: brandId,
              pillar_id: pillarId || null,
              platform,
              format,
              status: "pending_approval",
              title: generated.result.data.title ?? topic.slice(0, 80),
              copy: generated.result.data.caption,
              hashtags: generated.result.data.hashtags,
              structured: generated.result.data.structured,
              ai_generated: true,
              variant_group_id: variantGroupId,
              source_item_id: sourceItemId || null,
              agent_run_id: agentRunId,
              created_by: createdBy,
            })
            .select("id")
            .single();
          if (error || !item) throw new Error(error?.message ?? "Insert failed");
          ids.push(item.id);
          await applyComplianceToItem({
            organizationId,
            brandId,
            itemId: item.id,
            platform,
            format,
            copy: generated.result.data.caption,
            hashtags: generated.result.data.hashtags,
            structured: generated.result.data.structured,
          });
          await maybeAutoAttachMedia({
            organizationId,
            brandId,
            itemId: item.id,
            topic,
            title: generated.result.data.title ?? topic.slice(0, 80),
            copy: generated.result.data.caption,
          });
        } else {
          for (const variant of generated.result.data.variants) {
            const { data: item, error } = await supabase
              .from("content_items")
              .insert({
                organization_id: organizationId,
                brand_id: brandId,
                pillar_id: pillarId || null,
                platform,
                format,
                status: "pending_approval",
                title: variant.title ?? `${topic.slice(0, 60)} (${variant.label})`,
                copy: variant.copy,
                hashtags: variant.hashtags,
                structured: {
                  ...variant.structured,
                  rationale: variant.rationale,
                  variant_label: variant.label,
                },
                ai_generated: true,
                variant_group_id: variantGroupId,
                source_item_id: sourceItemId || null,
                agent_run_id: agentRunId,
                created_by: createdBy,
              })
              .select("id")
              .single();
            if (error || !item) throw new Error(error?.message ?? "Insert failed");
            ids.push(item.id);
            await applyComplianceToItem({
              organizationId,
              brandId,
              itemId: item.id,
              platform,
              format,
              copy: variant.copy,
              hashtags: variant.hashtags,
              structured: variant.structured,
            });
            await maybeAutoAttachMedia({
              organizationId,
              brandId,
              itemId: item.id,
              topic,
              title: variant.title ?? topic,
              copy: variant.copy,
            });
          }
        }

        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            model: generated.result.model,
            tokens_in: generated.result.tokensIn,
            tokens_out: generated.result.tokensOut,
            cost_pence: generated.result.costPence,
            duration_ms: Date.now() - started,
            output: { itemIds: ids, variantGroupId },
          })
          .eq("id", agentRunId);

        if (ids.length > 0) {
          const { notifyApprovalsNeeded } = await import(
            "@/lib/notifications/notify"
          );
          await notifyApprovalsNeeded({
            organizationId,
            title: `${ids.length} content draft${ids.length === 1 ? "" : "s"} need approval`,
            body: topic.slice(0, 160),
            link: "/content/queue",
          });
        }

        return ids;

      });

      return { ok: true, itemIds };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Content generation failed";
      await appendAgentRunLog(agentRunId, message, 100, "error");
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: message, progress: 100 })
        .eq("id", agentRunId);
      await recordJobFailure({
        organizationId,
        provider: "inngest",
        jobName: "content",
        error: message,
        agentRunId,
      });
      throw error;
    }
  },
);

export const runContentBatchPropose = inngest.createFunction(
  {
    id: "content/batch-propose",
    retries: 1,
    triggers: [{ event: "content/generate.batch-propose" }],
  },
  async ({ event, step }) => {
    const { planId, agentRunId, organizationId, brandId, model } = event.data as {
      planId: string;
      agentRunId: string;
      organizationId: string;
      brandId: string;
      model?: string;
    };

    const supabase = createAdminClient();

    try {
      const plan = await step.run("load-plan", async () => {
        await supabase
          .from("agent_runs")
          .update({ status: "running", progress: 5 })
          .eq("id", agentRunId);
        const { data, error } = await supabase
          .from("content_plans")
          .select("*")
          .eq("id", planId)
          .single();
        if (error || !data) throw new Error(error?.message ?? "Plan not found");
        return data;
      });

      const brandContext = await step.run("brand-context", async () => {
        await appendAgentRunLog(agentRunId, "Building 2-week mix proposal", 20);
        return getBrandContext(organizationId, brandId, { admin: true });
      });

      const enabledPlatforms = await step.run("enabled-platforms", async () => {
        return getBrandEnabledContentPlatforms({
          organizationId,
          brandId,
          admin: true,
        });
      });

      const proposal = await step.run("propose", async () => {
        return generateBatchPlan({
          brandContext,
          startDate: plan.start_date,
          endDate: plan.end_date,
          brief: String((plan.brief as { notes?: string }).notes ?? plan.title),
          enabledPlatforms,
          model,
        });
      });

      await step.run("save-slots", async () => {
        await appendAgentRunLog(agentRunId, "Saving proposed slots for review", 80);
        const pillarByName = new Map(
          brandContext.pillars.map((p) => [p.name.toLowerCase(), p.id]),
        );
        const allowed = new Set(enabledPlatforms);

        const rows = proposal.data.slots
          .filter((slot) => allowed.has(slot.platform))
          .map((slot, index) => {
            const scheduled = `${slot.date}T10:00:00.000Z`;
            return {
              organization_id: organizationId,
              plan_id: planId,
              pillar_id: pillarByName.get(slot.pillar_name.toLowerCase()) ?? null,
              platform: slot.platform,
              format: slot.format,
              topic: slot.topic,
              scheduled_at: scheduled,
              status: "proposed" as const,
              sort_order: index,
            };
          });

        if (rows.length === 0) {
          throw new Error(
            `No slots for enabled platforms (${enabledPlatforms.join(", ")})`,
          );
        }

        await supabase.from("content_plan_slots").delete().eq("plan_id", planId);
        const { error } = await supabase.from("content_plan_slots").insert(rows);
        if (error) throw new Error(error.message);

        await supabase
          .from("content_plans")
          .update({ status: "proposed", agent_run_id: agentRunId })
          .eq("id", planId);

        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            model: proposal.model,
            tokens_in: proposal.tokensIn,
            tokens_out: proposal.tokensOut,
            cost_pence: proposal.costPence,
            output: { slotCount: rows.length },
          })
          .eq("id", agentRunId);
      });

      return { ok: true, planId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch propose failed";
      await appendAgentRunLog(agentRunId, message, 100, "error");
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: message, progress: 100 })
        .eq("id", agentRunId);
      await supabase
        .from("content_plans")
        .update({ status: "cancelled" })
        .eq("id", planId);
      await recordJobFailure({
        organizationId,
        provider: "inngest",
        jobName: "content/batch-propose",
        error: message,
        agentRunId,
      });
      throw error;
    }
  },
);

export const runContentBatchGenerateSlots = inngest.createFunction(
  {
    id: "content/batch-generate-slots",
    retries: 1,
    triggers: [{ event: "content/generate.batch-slots" }],
  },
  async ({ event, step }) => {
    const { planId, agentRunId, organizationId, brandId, createdBy, model } =
      event.data as {
        planId: string;
        agentRunId: string;
        organizationId: string;
        brandId: string;
        createdBy: string;
        model?: string;
      };

    const supabase = createAdminClient();

    try {
      await step.run("mark-generating", async () => {
        await supabase
          .from("content_plans")
          .update({ status: "generating" })
          .eq("id", planId);
        await supabase
          .from("agent_runs")
          .update({ status: "running", progress: 5 })
          .eq("id", agentRunId);
      });

      const brandContext = await step.run("brand-context", async () => {
        return getBrandContext(organizationId, brandId, { admin: true });
      });

      const slots = await step.run("load-approved-slots", async () => {
        const { data, error } = await supabase
          .from("content_plan_slots")
          .select("*")
          .eq("plan_id", planId)
          .eq("status", "approved")
          .order("sort_order");
        if (error) throw new Error(error.message);
        return data ?? [];
      });

      await step.run("generate-each-slot", async () => {
        let done = 0;
        for (const slot of slots) {
          await appendAgentRunLog(
            agentRunId,
            `Generating: ${slot.topic}`,
            Math.round((done / Math.max(slots.length, 1)) * 80) + 10,
          );

          const pillarName = brandContext.pillars.find(
            (p) => p.id === slot.pillar_id,
          )?.name;

          let copy = "";
          let hashtags: string[] = [];
          let structured: Record<string, unknown> = {};
          let title = slot.topic.slice(0, 80);

          if (isScriptFormat(slot.format)) {
            const result = await generateScriptContent({
              brandContext,
              platform: slot.platform,
              format: slot.format,
              pillarName,
              topic: slot.topic,
              model,
            });
            copy = result.data.caption;
            hashtags = result.data.hashtags;
            structured = result.data.structured;
            title = result.data.title ?? title;
          } else {
            const result = await generateSinglePostVariants({
              brandContext,
              platform: slot.platform,
              format: slot.format,
              pillarName,
              topic: slot.topic,
              model,
            });
            const best = result.data.variants[0];
            copy = best.copy;
            hashtags = best.hashtags;
            structured = { ...best.structured, rationale: best.rationale };
            title = best.title ?? title;
          }

          const { data: item, error } = await supabase
            .from("content_items")
            .insert({
              organization_id: organizationId,
              brand_id: brandId,
              pillar_id: slot.pillar_id,
              platform: slot.platform,
              format: slot.format,
              status: "pending_approval",
              title,
              copy,
              hashtags,
              structured,
              ai_generated: true,
              plan_id: planId,
              scheduled_at: slot.scheduled_at,
              agent_run_id: agentRunId,
              created_by: createdBy,
            })
            .select("id")
            .single();

          if (error || !item) {
            await supabase
              .from("content_plan_slots")
              .update({ status: "failed" })
              .eq("id", slot.id);
            continue;
          }

          await applyComplianceToItem({
            organizationId,
            brandId,
            itemId: item.id,
            platform: slot.platform,
            format: slot.format,
            copy,
            hashtags,
            structured,
          });

          await maybeAutoAttachMedia({
            organizationId,
            brandId,
            itemId: item.id,
            topic: slot.topic,
            title,
            copy,
          });

          await supabase
            .from("content_plan_slots")
            .update({ status: "generated", content_item_id: item.id })
            .eq("id", slot.id);

          done += 1;
        }
      });

      await step.run("finalize", async () => {
        await supabase
          .from("content_plans")
          .update({ status: "complete" })
          .eq("id", planId);
        await supabase
          .from("agent_runs")
          .update({ status: "complete", progress: 100 })
          .eq("id", agentRunId);
        await appendAgentRunLog(agentRunId, "Batch generation complete", 100);

        const { count } = await supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("plan_id", planId)
          .eq("status", "pending_approval");
        if ((count ?? 0) > 0) {
          const { notifyApprovalsNeeded } = await import(
            "@/lib/notifications/notify"
          );
          await notifyApprovalsNeeded({
            organizationId,
            title: `${count} planned posts need approval`,
            body: "Batch generation finished — review the queue.",
            link: "/content/queue",
          });
        }
      });

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Batch generate failed";
      await appendAgentRunLog(agentRunId, message, 100, "error");
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: message, progress: 100 })
        .eq("id", agentRunId);
      await recordJobFailure({
        organizationId,
        provider: "inngest",
        jobName: "content/batch-generate",
        error: message,
        agentRunId,
      });
      throw error;
    }
  },
);

export const runContentRepurpose = inngest.createFunction(
  {
    id: "content/repurpose",
    retries: 1,
    triggers: [{ event: "content/generate.repurpose" }],
  },
  async ({ event, step }) => {
    const {
      organizationId,
      brandId,
      agentRunId,
      sourceItemId,
      createdBy,
      model,
    } = event.data as {
      organizationId: string;
      brandId: string;
      agentRunId: string;
      sourceItemId: string;
      createdBy: string;
      model?: string;
    };

    const supabase = createAdminClient();

    try {
      const source = await step.run("load-source", async () => {
        await supabase
          .from("agent_runs")
          .update({ status: "running", progress: 5 })
          .eq("id", agentRunId);
        const { data, error } = await supabase
          .from("content_items")
          .select("*")
          .eq("id", sourceItemId)
          .single();
        if (error || !data) throw new Error(error?.message ?? "Source item not found");
        return data;
      });

      const brandContext = await step.run("brand-context", async () => {
        return getBrandContext(organizationId, brandId, { admin: true });
      });

      const adaptations = await step.run("adapt", async () => {
        await appendAgentRunLog(agentRunId, "Repurposing across platforms", 25);
        const enabled = await getBrandEnabledContentPlatforms({
          organizationId,
          brandId,
          admin: true,
        });
        const targets = enabled.filter((p) => p !== source.platform);
        if (targets.length === 0) {
          throw new Error(
            "No other enabled platforms to repurpose to. Update Brand → Channels.",
          );
        }
        return generateRepurposeAdaptations({
          brandContext,
          sourcePlatform: source.platform,
          sourceFormat: source.format,
          sourceCopy: source.copy,
          sourceHashtags: source.hashtags ?? [],
          sourceStructured: (source.structured as Record<string, unknown>) ?? {},
          targetPlatforms: targets,
          model,
        });
      });

      await step.run("persist", async () => {
        const enabled = await getBrandEnabledContentPlatforms({
          organizationId,
          brandId,
          admin: true,
        });
        const allowed = new Set(enabled);
        const ids: string[] = [];
        for (const adaptation of adaptations.data.adaptations) {
          if (!allowed.has(adaptation.platform)) continue;
          const { data: item, error } = await supabase
            .from("content_items")
            .insert({
              organization_id: organizationId,
              brand_id: brandId,
              pillar_id: source.pillar_id,
              platform: adaptation.platform,
              format: adaptation.format,
              status: "pending_approval",
              title: adaptation.title ?? `Repurposed → ${adaptation.platform}`,
              copy: adaptation.copy,
              hashtags: adaptation.hashtags,
              structured: {
                ...adaptation.structured,
                repurpose_notes: adaptation.notes,
              },
              ai_generated: true,
              source_item_id: sourceItemId,
              agent_run_id: agentRunId,
              created_by: createdBy,
            })
            .select("id")
            .single();
          if (error || !item) continue;
          ids.push(item.id);
          await applyComplianceToItem({
            organizationId,
            brandId,
            itemId: item.id,
            platform: adaptation.platform,
            format: adaptation.format,
            copy: adaptation.copy,
            hashtags: adaptation.hashtags,
            structured: adaptation.structured,
          });
          await maybeAutoAttachMedia({
            organizationId,
            brandId,
            itemId: item.id,
            topic: adaptation.title ?? source.title ?? source.copy.slice(0, 80),
            title: adaptation.title,
            copy: adaptation.copy,
          });
        }

        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            model: adaptations.model,
            tokens_in: adaptations.tokensIn,
            tokens_out: adaptations.tokensOut,
            cost_pence: adaptations.costPence,
            output: { itemIds: ids },
          })
          .eq("id", agentRunId);

        if (ids.length > 0) {
          const { notifyApprovalsNeeded } = await import(
            "@/lib/notifications/notify"
          );
          await notifyApprovalsNeeded({
            organizationId,
            title: `${ids.length} repurposed draft${ids.length === 1 ? "" : "s"} need approval`,
            link: "/content/queue",
          });
        }
      });

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Repurpose failed";
      await appendAgentRunLog(agentRunId, message, 100, "error");
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: message, progress: 100 })
        .eq("id", agentRunId);
      await recordJobFailure({
        organizationId,
        provider: "inngest",
        jobName: "content/repurpose",
        error: message,
        agentRunId,
      });
      throw error;
    }
  },
);

export const contentFunctions = [
  runContentSingleGenerate,
  runContentBatchPropose,
  runContentBatchGenerateSlots,
  runContentRepurpose,
];
