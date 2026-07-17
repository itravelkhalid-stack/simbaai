import Link from "next/link";
import { redirect } from "next/navigation";

import { CampaignEditor } from "@/components/email/campaign-editor";
import { EmailNav } from "@/components/email/email-nav";
import { buttonVariants } from "@/components/ui/button";
import { createBlock } from "@/lib/email/blocks";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  EmailCampaign,
  EmailList,
  EmailSegment,
  EmailSendingDomain,
} from "@/lib/types/email";
import { cn } from "@/lib/utils";

export default async function NewCampaignPage() {
  const { user, active } = await requireActiveOrg();
  if (active.role === "org_viewer") redirect("/email/campaigns");

  const supabase = await createClient();
  const brandId = (
    await supabase
      .from("brands")
      .select("id")
      .eq("organization_id", active.organization_id)
      .eq("is_primary", true)
      .maybeSingle()
  ).data?.id;

  const { data: brandFallback } = brandId
    ? { data: { id: brandId } }
    : await supabase
        .from("brands")
        .select("id")
        .eq("organization_id", active.organization_id)
        .limit(1)
        .maybeSingle();

  if (!brandFallback?.id) {
    return (
      <div className="space-y-4">
        <EmailNav current="/email/campaigns" />
        <p className="text-muted-foreground">
          Create a brand first before drafting campaigns.
        </p>
      </div>
    );
  }

  const blocks = [
    createBlock("heading"),
    createBlock("text"),
    createBlock("button"),
  ];

  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .insert({
      organization_id: active.organization_id,
      brand_id: brandFallback.id,
      name: "Untitled campaign",
      subject: "",
      blocks,
      status: "draft",
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error || !campaign) throw new Error(error?.message ?? "Failed to create");

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EmailNav current="/email/campaigns" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            New campaign
          </h1>
        </div>
        <Link
          href="/email/campaigns"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Back
        </Link>
      </div>
      <CampaignEditor
        campaign={campaign as EmailCampaign}
        lists={(lists ?? []) as EmailList[]}
        segments={(segments ?? []) as EmailSegment[]}
        domains={(domains ?? []) as EmailSendingDomain[]}
      />
    </div>
  );
}
