import { inngest } from "@/lib/inngest/client";
import { detectAnalyticsAnomalies } from "@/lib/data/anomalies";
import { syncAllGa4Connections } from "@/lib/data/ga4";
import { buildAnalyticsDailyRollups } from "@/lib/data/rollups";

export const analyticsNightlyRollup = inngest.createFunction(
  {
    id: "analytics/nightly-rollup",
    retries: 1,
    triggers: [{ cron: "30 4 * * *" }],
  },
  async ({ step }) => {
    await step.run("ga4-sync", async () => syncAllGa4Connections(14));
    return step.run("rollup", async () => buildAnalyticsDailyRollups(14));
  },
);

export const analyticsRollupOnDemand = inngest.createFunction(
  {
    id: "analytics/rollup-on-demand",
    retries: 1,
    triggers: [{ event: "analytics/rollup.run" }],
  },
  async ({ event, step }) => {
    const daysBack = Number(event.data?.daysBack ?? 14);
    return step.run("rollup", async () => buildAnalyticsDailyRollups(daysBack));
  },
);

export const analyticsDailyAnomalies = inngest.createFunction(
  {
    id: "analytics/daily-anomalies",
    retries: 1,
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }) => {
    // Ensure yesterday is rolled up before detecting
    await step.run("rollup", async () => buildAnalyticsDailyRollups(3));
    return step.run("detect", async () => detectAnalyticsAnomalies());
  },
);

export const analyticsFunctions = [
  analyticsNightlyRollup,
  analyticsRollupOnDemand,
  analyticsDailyAnomalies,
];
