import Link from "next/link";

import { EmailNav } from "@/components/email/email-nav";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Email</h1>
          <p className="mt-2 text-muted-foreground">
            Lists, campaigns, automations, and Resend sending for{" "}
            {active.organization.name}.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/email/campaigns/new" className={cn(buttonVariants())}>
            New campaign
          </Link>
          <Link
            href="/email/flows"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Flows
          </Link>
        </div>
      </div>
      <EmailNav current="/email" />
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>{lists ?? 0}</CardTitle>
            <CardDescription>Lists</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{subscribers ?? 0}</CardTitle>
            <CardDescription>Subscribed contacts</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{campaigns ?? 0}</CardTitle>
            <CardDescription>Campaigns</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{flows ?? 0}</CardTitle>
            <CardDescription>Flows</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
