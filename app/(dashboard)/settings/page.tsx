import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireActiveOrg } from "@/lib/org/require";
import { cn } from "@/lib/utils";

export default async function SettingsPage() {
  const { active } = await requireActiveOrg();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-muted-foreground">
          Workspace preferences for {active.organization.name}.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            Invite members, change roles, and revoke invitations.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Link href="/settings/team" className={cn(buttonVariants())}>
            Manage team
          </Link>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>
            Connect Meta, X, LinkedIn, TikTok, Pinterest, and YouTube for publishing.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Link href="/settings/connections" className={cn(buttonVariants())}>
            Manage connections
          </Link>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Meetings</CardTitle>
          <CardDescription>
            Schedule daily standups, weekly marketing panels, and board packs per brand.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Link href="/meetings/settings" className={cn(buttonVariants())}>
            Meeting schedule
          </Link>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
          <CardDescription>
            Report cadence, branding, and auto-email recipients per brand.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Link href="/reviews/settings" className={cn(buttonVariants())}>
            Report schedule
          </Link>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Email digest preferences and Slack incoming webhook.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <Link href="/settings/notifications" className={cn(buttonVariants())}>
            Notification settings
          </Link>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Finance & billing</CardTitle>
          <CardDescription>
            Marketing budgets and GrowthOS plan / Stripe invoices.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6 flex flex-wrap gap-2">
          <Link href="/finance" className={cn(buttonVariants())}>
            Finance dashboard
          </Link>
          <Link href="/finance/billing" className={cn(buttonVariants({ variant: "outline" }))}>
            Billing
          </Link>
        </div>
      </Card>
    </div>
  );
}
