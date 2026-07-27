import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { EmailNav } from "@/components/email/email-nav";
import { MetricCard } from "@/components/brand/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function EmailHomePage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [
    { count: lists },
    { count: subscribers },
    { count: campaigns },
    { count: flows },
  ] = await Promise.all([
    supabase
      .from("email_lists")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id),
    supabase
      .from("email_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id)
      .eq("status", "subscribed"),
    supabase
      .from("email_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id),
    supabase
      .from("email_flows")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email"
        description={
          <>
            Lists, campaigns, automations, and Resend sending for{" "}
            {active.organization.name}.
          </>
        }
        actions={
          <>
            <Link href="/email/campaigns/new" className={cn(buttonVariants())}>
              New campaign
            </Link>
            <Link
              href="/email/flows"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Flows
            </Link>
          </>
        }
      />
      <EmailNav current="/email" />
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Lists" value={String(lists ?? 0)} />
        <MetricCard label="Subscribed contacts" value={String(subscribers ?? 0)} />
        <MetricCard label="Campaigns" value={String(campaigns ?? 0)} />
        <MetricCard label="Flows" value={String(flows ?? 0)} />
      </div>
    </div>
  );
}
