import { inngest } from "@/lib/inngest/client";
import { sendDailyNotificationDigests } from "@/lib/notifications/notify";

/** Daily email digest for users with email_digest=daily. */
export const notificationsDailyDigest = inngest.createFunction(
  {
    id: "notifications/daily-digest",
    retries: 1,
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    return step.run("send-digests", async () => sendDailyNotificationDigests());
  },
);

export const notificationsFunctions = [notificationsDailyDigest];
