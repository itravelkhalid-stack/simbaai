import { extractGuidelinesFromPdfAsset } from "@/lib/media/guidelines-ingest";
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

export const brandFunctions = [runBrandGuidelinesPdfIngest];
