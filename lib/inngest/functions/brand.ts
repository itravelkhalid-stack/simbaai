import { extractGuidelinesFromPdfAsset } from "@/lib/media/guidelines-ingest";
import { tagMediaAssetWithVision } from "@/lib/media/tag";
import { inngest } from "@/lib/inngest/client";
import { recordJobFailure } from "@/lib/inngest/functions/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runBrandGuidelinesPdfIngest = inngest.createFunction(
  {
    id: "brand/guidelines-pdf-ingest",
    retries: 1,
    triggers: [{ event: "brand/guidelines.pdf.ingest" }],
  },
  async ({ event, step }) => {
    const {
      organizationId,
      brandId,
      mediaAssetId,
      agentRunId,
      userId,
    } = event.data as {
      organizationId: string;
      brandId: string;
      mediaAssetId: string;
      agentRunId: string;
      userId?: string;
    };

    try {
      await step.run("mark-running", async () => {
        const supabase = createAdminClient();
        await supabase
          .from("agent_runs")
          .update({ status: "running", progress: 5 })
          .eq("id", agentRunId);
      });

      const result = await step.run("extract-guidelines", async () =>
        extractGuidelinesFromPdfAsset({
          organizationId,
          brandId,
          mediaAssetId,
          userId,
          agentRunId,
        }),
      );

      return result;
    } catch (error) {
      await recordJobFailure({
        organizationId,
        provider: "brand",
        jobName: "brand/guidelines-pdf-ingest",
        eventName: "brand/guidelines.pdf.ingest",
        payload: { brandId, mediaAssetId, agentRunId },
        error: error instanceof Error ? error.message : String(error),
        agentRunId,
      });
      throw error;
    }
  },
);

export const runBrandMediaVisionTag = inngest.createFunction(
  {
    id: "brand/media-vision-tag",
    retries: 1,
    triggers: [{ event: "brand/media.tag" }],
  },
  async ({ event, step }) => {
    const { organizationId, mediaAssetId, agentRunId } = event.data as {
      organizationId: string;
      brandId: string;
      mediaAssetId: string;
      agentRunId: string;
      userId?: string;
    };

    try {
      return await step.run("tag-image", async () =>
        tagMediaAssetWithVision({
          organizationId,
          mediaAssetId,
          agentRunId,
        }),
      );
    } catch (error) {
      const supabase = createAdminClient();
      const message =
        error instanceof Error ? error.message : "Media tagging failed";
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: message, progress: 100 })
        .eq("id", agentRunId);
      await recordJobFailure({
        organizationId,
        provider: "brand",
        jobName: "brand/media-vision-tag",
        eventName: "brand/media.tag",
        payload: { mediaAssetId, agentRunId },
        error: message,
        agentRunId,
      });
      throw error;
    }
  },
);

export const brandFunctions = [
  runBrandGuidelinesPdfIngest,
  runBrandMediaVisionTag,
];
