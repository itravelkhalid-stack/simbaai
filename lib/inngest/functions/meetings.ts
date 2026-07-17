import { inngest } from "@/lib/inngest/client";
import { scheduleDueMeetings } from "@/lib/meetings/schedule";
import { runMeeting } from "@/lib/meetings/run";

/** Hourly: create scheduled meetings per brand based on org settings, then run them. */
export const meetingsHourlyScheduler = inngest.createFunction(
  {
    id: "meetings/hourly-scheduler",
    retries: 1,
    triggers: [{ cron: "5 * * * *" }],
  },
  async ({ step }) => {
    const scheduled = await step.run("schedule", async () => scheduleDueMeetings());

    for (const item of scheduled.created) {
      await step.sendEvent(`run-${item.meetingId}`, {
        name: "meetings/run",
        data: { meetingId: item.meetingId },
      });
    }

    return scheduled;
  },
);

export const meetingsRunMeeting = inngest.createFunction(
  {
    id: "meetings/run",
    retries: 1,
    triggers: [{ event: "meetings/run" }],
  },
  async ({ event, step }) => {
    const { meetingId } = event.data as { meetingId: string };
    return step.run("generate", async () => runMeeting(meetingId));
  },
);

export const meetingsFunctions = [meetingsHourlyScheduler, meetingsRunMeeting];
