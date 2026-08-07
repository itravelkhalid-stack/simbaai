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

export const adsFunctions = [
  ingestDailyAdMetrics,
  runDailyAdsOptimisation,
  runAdsBudgetLoop,
  syncAdCampaignMetricsNow,
];
