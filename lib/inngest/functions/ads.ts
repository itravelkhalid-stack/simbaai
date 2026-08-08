import { inngest } from "@/lib/inngest/client";
import { syncAllManagedCampaignMetrics } from "@/lib/ads/metrics";
import { runDailyOptimisationAllOrgs } from "@/lib/ads/optimisation";

export const ingestDailyAdMetrics = inngest.createFunction(
  {
    id: "ads/ingest-daily-metrics",
    retries: 1,
    triggers: [{ cron: "0 7 * * *" }],
  },
  async ({ step }) => {
    return step.run("sync-metrics", async () => syncAllManagedCampaignMetrics(100));
  },
);

export const runDailyAdsOptimisation = inngest.createFunction(
  {
    id: "ads/daily-optimisation",
    retries: 1,
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    return step.run("optimise", async () => runDailyOptimisationAllOrgs());
  },
);

export const runAdsBudgetLoop = inngest.createFunction(
  {
    id: "ads/budget-loop",
    retries: 1,
    triggers: [
      { cron: "0 7 * * 1" },
      { event: "ads/budget-loop.run" },
    ],
  },
  async ({ event, step }) => {
    const data = (event?.data ?? {}) as {
      organizationId?: string;
      brandId?: string;
      force?: boolean;
    };
    if (data.organizationId && data.brandId) {
      const { runBrandBudgetAdsLoop } = await import("@/lib/ads/budget-loop");
      return step.run("budget-one", () =>
        runBrandBudgetAdsLoop({
          organizationId: data.organizationId!,
          brandId: data.brandId!,
          force: Boolean(data.force),
        }),
      );
    }
    const { runBudgetAdsLoopsForAllBrands } = await import(
      "@/lib/ads/budget-loop"
    );
    return step.run("budget-all", () => runBudgetAdsLoopsForAllBrands());
  },
);

export const syncAdCampaignMetricsNow = inngest.createFunction(
  {
    id: "ads/sync-metrics-now",
    retries: 1,
    triggers: [{ event: "ads/metrics.sync" }],
  },
  async ({ step }) => {
    return step.run("sync", async () => syncAllManagedCampaignMetrics(50));
  },
);

/** Quarterly destination seasonality refresh for brands with ads enabled. */
export const refreshAdsSeasonalityQuarterly = inngest.createFunction(
  {
    id: "ads/seasonality-quarterly",
    retries: 1,
    triggers: [
      { cron: "0 6 1 1,4,7,10 *" },
      { event: "ads/seasonality.refresh" },
    ],
  },
  async ({ event, step }) => {
    const data = (event?.data ?? {}) as {
      organizationId?: string;
      brandId?: string;
    };
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { runDestinationSeasonalityResearch } = await import(
      "@/lib/ads/seasonality-research"
    );
    const supabase = createAdminClient();
    if (data.organizationId && data.brandId) {
      return step.run("one", () =>
        runDestinationSeasonalityResearch({
          organizationId: data.organizationId!,
          brandId: data.brandId!,
        }),
      );
    }
    const { data: brands } = await supabase
      .from("brands")
      .select("id, organization_id, agent_activity_paused")
      .eq("agent_activity_paused", false)
      .limit(100);
    const results = [];
    for (const b of brands ?? []) {
      results.push(
        await step.run(`brand-${b.id}`, () =>
          runDestinationSeasonalityResearch({
            organizationId: b.organization_id,
            brandId: b.id,
          }).catch((err: unknown) => ({
            brandId: b.id,
            error: err instanceof Error ? err.message : "failed",
          })),
        ),
      );
    }
    return results;
  },
);

export const adsFunctions = [
  ingestDailyAdMetrics,
  runDailyAdsOptimisation,
  runAdsBudgetLoop,
  syncAdCampaignMetricsNow,
  refreshAdsSeasonalityQuarterly,
];
