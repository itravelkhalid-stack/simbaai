import Link from "next/link";

import { CampaignAiForm } from "@/components/email/campaign-ai-form";
import { EmailNav } from "@/components/email/email-nav";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailCampaign } from "@/lib/types/email";
import { cn } from "@/lib/utils";

export default async function EmailCampaignsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-2 text-muted-foreground">
            Draft, AI-generate, schedule, and track one-off sends.
          </p>
        </div>
        <Link href="/email/campaigns/new" className={cn(buttonVariants())}>
          New campaign
        </Link>
      </div>
      <EmailNav current="/email/campaigns" />
      <CampaignAiForm />
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as EmailCampaign[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No campaigns yet.</li>
        ) : (
          ((data ?? []) as EmailCampaign[]).map((campaign) => (
            <li
              key={campaign.id}
              className="flex flex-wrap items-center justify-between gap-2 p-4"
            >
              <div>
                <Link
                  href={`/email/campaigns/${campaign.id}`}
                  className="font-medium underline"
                >
                  {campaign.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {campaign.subject || "No subject"} · {campaign.status}
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Sent {campaign.stats?.sent ?? 0}</p>
                <p>
                  Opens {campaign.stats?.opens ?? 0} · Clicks{" "}
                  {campaign.stats?.clicks ?? 0}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
