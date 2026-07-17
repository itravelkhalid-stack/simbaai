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
  syncAdCampaignMetricsNow,
];
