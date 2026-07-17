import Link from "next/link";
import { notFound } from "next/navigation";

import { CampaignEditor } from "@/components/email/campaign-editor";
import { EmailNav } from "@/components/email/email-nav";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  EmailCampaign,
  EmailList,
  EmailSegment,
  EmailSendingDomain,
} from "@/lib/types/email";
import { cn } from "@/lib/utils";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!campaign) notFound();

  const [{ data: lists }, { data: segments }, { data: domains }] =
    await Promise.all([
      supabase
        .from("email_lists")
        .select("*")
        .eq("organization_id", active.organization_id),
      supabase
        .from("email_segments")
        .select("*")
        .eq("organization_id", active.organization_id),
      supabase
        .from("email_sending_domains")
        .select("*")
        .eq("organization_id", active.organization_id),
    ]);

  const c = campaign as EmailCampaign;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EmailNav current="/email/campaigns" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{c.name}</h1>
          <p className="text-sm text-muted-foreground">
            Status: {c.status}
            {c.sent_at ? ` · Sent ${new Date(c.sent_at).toLocaleString()}` : ""}
          </p>
        </div>
        <Link
          href="/email/campaigns"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          All campaigns
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {(
          [
            ["sent", "Sent"],
            ["delivered", "Delivered"],
            ["opens", "Opens"],
            ["clicks", "Clicks"],
            ["unsubscribes", "Unsubs"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="rounded-xl border p-3">
            <p className="text-2xl font-semibold">{c.stats?.[key] ?? 0}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <CampaignEditor
        campaign={c}
        lists={(lists ?? []) as EmailList[]}
        segments={(segments ?? []) as EmailSegment[]}
        domains={(domains ?? []) as EmailSendingDomain[]}
      />
    </div>
  );
}
