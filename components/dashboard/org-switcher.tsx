"use client";

import { switchOrganization } from "@/lib/org/actions";
import type { OrgMembership } from "@/lib/org/session";
import { Label } from "@/components/ui/label";

export function OrgSwitcher({
  memberships,
  activeOrganizationId,
}: {
  memberships: OrgMembership[];
  activeOrganizationId: string;
}) {
  const active = memberships.find((m) => m.organization_id === activeOrganizationId);

  if (memberships.length <= 1) {
    return (
      <div className="rounded-lg bg-surface p-3 shadow-elevated ring-1 ring-border">
        <p className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
          Workspace
        </p>
        <p className="mt-1 truncate text-sm font-semibold text-ink">
          {active?.organization.name ?? "Organization"}
        </p>
        <p className="truncate text-xs text-ink-soft">
          {active?.organization.slug}
        </p>
      </div>
    );
  }

  return (
    <form
      action={switchOrganization}
      className="space-y-2 rounded-lg bg-surface p-3 shadow-elevated ring-1 ring-border"
    >
      <Label htmlFor="organizationId" className="text-[11px] font-medium tracking-wide text-ink-soft uppercase">
        Workspace
      </Label>
      <select
        id="organizationId"
        name="organizationId"
        defaultValue={activeOrganizationId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 w-full rounded-md border border-input bg-surface px-2 text-sm outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {memberships.map((membership) => (
          <option key={membership.id} value={membership.organization_id}>
            {membership.organization.name}
          </option>
        ))}
      </select>
    </form>
  );
}
