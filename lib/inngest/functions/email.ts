import { inngest } from "@/lib/inngest/client";
import { sendCampaign } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";

export const sendEmailCampaignJob = inngest.createFunction(
  {
    id: "email/send-campaign",
    retries: 1,
    triggers: [{ event: "email/campaign.send" }],
  },
  async ({ event, step }) => {
    const { campaignId } = event.data as { campaignId: string };
    return step.run("send", async () => sendCampaign(campaignId));
  },
);

export const sendDueEmailCampaigns = inngest.createFunction(
  {
    id: "email/send-due-campaigns",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    const due = await step.run("list-due", async () => {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("id")
        .eq("status", "scheduled")
        .lte("scheduled_at", new Date().toISOString())
        .limit(10);
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    const results = [];
    for (const campaign of due) {
      results.push(
        await step.run(`send-${campaign.id}`, async () => sendCampaign(campaign.id)),
      );
    }
    return { processed: results.length };
  },
);

export const emailFunctions = [sendEmailCampaignJob, sendDueEmailCampaigns];
