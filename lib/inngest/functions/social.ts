import { inngest } from "@/lib/inngest/client";
import { ingestMetricsForPublishedItems } from "@/lib/social/metrics";
import { listDueContentItems, publishContentItem } from "@/lib/social/publish";

/** Publishes approved+scheduled content_items that are due. Runs every 5 minutes. */
export const publishDueSocialPosts = inngest.createFunction(
  {
    id: "social/publish-due-posts",
    retries: 2,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const due = await step.run("list-due", async () => listDueContentItems(25));

    const outcomes: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const item of due) {
      const result = await step.run(`publish-${item.id}`, async () => {
        try {
          await publishContentItem(item.id);
          return { id: item.id, ok: true as const };
        } catch (error) {
          return {
            id: item.id,
            ok: false as const,
            error: error instanceof Error ? error.message : "publish failed",
          };
        }
      });
      outcomes.push(result);
    }

    return { processed: outcomes.length, outcomes };
  },
);

/** Daily metrics pull into content_metrics for analytics. */
export const ingestDailySocialMetrics = inngest.createFunction(
  {
    id: "social/ingest-daily-metrics",
    retries: 1,
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }) => {
    const results = await step.run("ingest", async () =>
      ingestMetricsForPublishedItems(100),
    );
    return {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
  },
);

/** Manual/on-demand publish for a single item (calendar retry). */
export const publishSocialPostNow = inngest.createFunction(
  {
    id: "social/publish-post-now",
    retries: 2,
    triggers: [{ event: "social/publish.requested" }],
  },
  async ({ event, step }) => {
    const { contentItemId } = event.data as { contentItemId: string };
    return step.run("publish", async () => publishContentItem(contentItemId));
  },
);

export const socialFunctions = [
  publishDueSocialPosts,
  ingestDailySocialMetrics,
  publishSocialPostNow,
];
