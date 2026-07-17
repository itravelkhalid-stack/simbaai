import { inngest } from "@/lib/inngest/client";
import { scheduleDueReports } from "@/lib/reviews/schedule";
import { runReport } from "@/lib/reviews/run";

/** Hourly: create due reports per brand settings, then generate. */
export const reviewsHourlyScheduler = inngest.createFunction(
  {
    id: "reviews/hourly-scheduler",
    retries: 1,
    triggers: [{ cron: "10 * * * *" }],
  },
  async ({ step }) => {
    const scheduled = await step.run("schedule", async () => scheduleDueReports());
    for (const item of scheduled.created) {
      await step.sendEvent(`run-${item.reportId}`, {
        name: "reviews/run",
        data: { reportId: item.reportId },
      });
    }
    return scheduled;
  },
);

export const reviewsRunReport = inngest.createFunction(
  {
    id: "reviews/run",
    retries: 1,
    triggers: [{ event: "reviews/run" }],
  },
  async ({ event, step }) => {
    const { reportId } = event.data as { reportId: string };
    return step.run("generate", async () => runReport(reportId));
  },
);

export const reviewsFunctions = [reviewsHourlyScheduler, reviewsRunReport];
