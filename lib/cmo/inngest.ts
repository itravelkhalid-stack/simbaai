import { inngest } from "@/lib/inngest/client";

export const runCmoContentReview = inngest.createFunction(
  {
    id: "content/cmo-review",
    retries: 1,
    triggers: [{ event: "content/cmo.review" }],
  },
  async ({ event, step }) => {
    const data = (event.data ?? {}) as {
      organizationId?: string;
      brandId?: string;
      itemIds?: string[];
      backfill?: boolean;
    };
    if (!data.organizationId || !data.brandId) {
      return { ok: false, error: "organizationId and brandId required" };
    }

    const { skipIfBrandAgentHalted } = await import("@/lib/brand/agent-halt");
    const halt = await skipIfBrandAgentHalted({
      organizationId: data.organizationId,
      brandId: data.brandId,
    });
    if (halt) return { ok: true, ...halt };

    if (data.backfill || !data.itemIds?.length) {
      const { runCmoBackfillForBrand } = await import("@/lib/cmo/run");
      return step.run("cmo-backfill", () =>
        runCmoBackfillForBrand({
          organizationId: data.organizationId!,
          brandId: data.brandId!,
          limit: 80,
        }),
      );
    }

    const { reviewContentItemAsCmo } = await import("@/lib/cmo/approve");
    const results = [];
    for (const itemId of data.itemIds) {
      const result = await step.run(`cmo-${itemId}`, () =>
        reviewContentItemAsCmo({
          organizationId: data.organizationId!,
          brandId: data.brandId!,
          itemId,
        }),
      );
      results.push(result);
    }
    return { ok: true, results };
  },
);

/** Drain pending_approval queues for autonomous brands — CMO must not wait on manual triggers. */
export const runCmoAutonomousBackfillCron = inngest.createFunction(
  {
    id: "content/cmo-autonomous-backfill",
    retries: 1,
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    return step.run("backfill-autonomous-brands", async () => {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const { isCmoEnabledForBrandRow } = await import("@/lib/cmo/settings");
      const { runCmoBackfillForBrand } = await import("@/lib/cmo/run");
      const supabase = createAdminClient();
      const { data: brands } = await supabase
        .from("brands")
        .select("id, organization_id, autonomy_mode, channel_modes, agent_activity_paused")
        .eq("agent_activity_paused", false)
        .limit(200);

      const outcomes: Array<{
        brandId: string;
        reviewed: number;
        approved: number;
        scheduled: number;
        parked: number;
      }> = [];

      for (const brand of brands ?? []) {
        if (!isCmoEnabledForBrandRow(brand)) continue;
        const { count } = await supabase
          .from("content_items")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", brand.organization_id)
          .eq("brand_id", brand.id)
          .eq("status", "pending_approval");
        if (!count) continue;

        const result = await runCmoBackfillForBrand({
          organizationId: brand.organization_id,
          brandId: brand.id,
          limit: 80,
        });
        outcomes.push({
          brandId: brand.id,
          reviewed: result.reviewed,
          approved: result.results.filter((r) => r.outcome === "approved").length,
          scheduled: result.results.filter((r) => r.outcome === "scheduled").length,
          parked: result.results.filter((r) => r.outcome === "parked").length,
        });
      }
      return { brands: outcomes.length, outcomes };
    });
  },
);

export const cmoFunctions = [runCmoContentReview, runCmoAutonomousBackfillCron];
