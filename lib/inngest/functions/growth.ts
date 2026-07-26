import { inngest } from "@/lib/inngest/client";
import { runWeeklyGrowthReviewAllBrands } from "@/lib/content/growth";

/** Monday 09:00 UTC — organic growth review feeds next content batch. */
export const runWeeklyOrganicGrowth = inngest.createFunction(
  {
    id: "content/weekly-growth-review",
    retries: 1,
    triggers: [{ cron: "0 9 * * 1" }],
  },
  async ({ step }) => {
    return step.run("growth-review", async () => runWeeklyGrowthReviewAllBrands());
  },
);

export const growthFunctions = [runWeeklyOrganicGrowth];
