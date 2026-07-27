import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateNotificationPreferences,
  updateOrgSlackWebhook,
} from "@/lib/notifications/actions";
import { ensureDefaultNotificationPreferences } from "@/lib/notifications/notify";
import { canManageTeam } from "@/lib/org/session";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  type EmailDigestPreference,
  type NotificationCategory,
} from "@/lib/types/platform";
import { cn } from "@/lib/utils";
import { fieldSelectClass } from "@/lib/ui/field";

export default async function NotificationSettingsPage() {
  const { user, active } = await requireActiveOrg();
  await ensureDefaultNotificationPreferences(user.id);

  const supabase = await createClient();
  const [{ data: prefs }, { data: orgSettings }] = await Promise.all([
    supabase
      .from("notification_preferences")
      .select("category, email_digest")
      .eq("user_id", user.id),
    supabase
      .from("org_notification_settings")
      .select("slack_webhook_url")
      .eq("organization_id", active.organization_id)
      .maybeSingle(),
  ]);

  const prefMap = new Map(
    (prefs ?? []).map((p) => [
      p.category as NotificationCategory,
      p.email_digest as EmailDigestPreference,
    ]),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mb-2")}
        >
          ← Settings
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-2 text-muted-foreground">
          Email digests and Slack delivery for {active.organization.name}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email preferences</CardTitle>
          <CardDescription>
            Immediate sends now, daily digests at ~08:00 UTC, or off. In-app
            notifications always land in the bell.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateNotificationPreferences} className="space-y-4">
            {NOTIFICATION_CATEGORIES.map((category) => (
              <div
                key={category}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-0"
              >
                <Label htmlFor={`email_${category}`}>
                  {NOTIFICATION_CATEGORY_LABELS[category]}
                </Label>
                <select
                  id={`email_${category}`}
                  name={`email_${category}`}
                  defaultValue={prefMap.get(category) ?? "immediate"}
                  className={fieldSelectClass}
                >
                  <option value="immediate">Immediate</option>
                  <option value="daily">Daily digest</option>
                  <option value="off">Off</option>
                </select>
              </div>
            ))}
            <Button type="submit">Save preferences</Button>
          </form>
        </CardContent>
      </Card>

      {canManageTeam(active.role) ? (
        <Card>
          <CardHeader>
            <CardTitle>Slack webhook</CardTitle>
            <CardDescription>
              Optional incoming webhook for org-wide alerts (approvals, blockers,
              anomalies).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateOrgSlackWebhook} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="slack_webhook_url">Webhook URL</Label>
                <Input
                  id="slack_webhook_url"
                  name="slack_webhook_url"
                  type="url"
                  placeholder="https://hooks.slack.com/services/..."
                  defaultValue={orgSettings?.slack_webhook_url ?? ""}
                />
              </div>
              <Button type="submit">Save Slack webhook</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
