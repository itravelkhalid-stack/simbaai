import { inngest } from "@/lib/inngest/client";
import { runWeeklyPipelineReviews } from "@/lib/crm/pipeline-review";

/** Monday 07:00 UTC — weekly pipeline review per brand */
export const crmWeeklyPipelineReview = inngest.createFunction(
  {
    id: "crm/weekly-pipeline-review",
    retries: 1,
    triggers: [{ cron: "0 7 * * 1" }],
  },
  async ({ step }) => {
    return step.run("review", async () => runWeeklyPipelineReviews());
  },
);

export const crmFunctions = [crmWeeklyPipelineReview];
