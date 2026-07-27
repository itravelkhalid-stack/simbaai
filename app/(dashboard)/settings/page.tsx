import Link from "next/link";

import { requireActiveOrg } from "@/lib/org/require";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function SettingsPage() {
  const { active } = await requireActiveOrg();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={
          <>
            Workspace preferences for {active.organization.name}.
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <SettingsLink href="/settings/team" title="Team" description="Invite members, change roles, and revoke invitations." />
        <SettingsLink href="/settings/connections" title="Connections" description="Connect channels for publishing and reporting." />
        <SettingsLink href="/meetings/settings" title="Meetings" description="Schedule daily standups, marketing panels, and board packs." />
        <SettingsLink href="/reviews/settings" title="Reviews" description="Set report cadence, branding, and auto-email recipients." />
        <SettingsLink href="/settings/notifications" title="Notifications" description="Manage email digests and Slack delivery." />
        <SettingsLink href="/finance" title="Finance & billing" description="Review marketing budgets, Simba AI plan, and Stripe invoices." />
      </div>
    </div>
  );
}

function SettingsLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border transition-colors hover:ring-brand/40"
    >
      <h2 className="font-heading font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-soft">{description}</p>
    </Link>
  );
}
