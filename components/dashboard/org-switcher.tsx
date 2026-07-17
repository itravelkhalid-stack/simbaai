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
      <div className="rounded-lg border px-3 py-2">
        <p className="truncate text-sm font-medium">
          {active?.organization.name ?? "Organization"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {active?.organization.slug}
        </p>
      </div>
    );
  }

  return (
    <form action={switchOrganization} className="space-y-2">
      <Label htmlFor="organizationId" className="text-xs text-muted-foreground">
        Organization
      </Label>
      <select
        id="organizationId"
        name="organizationId"
        defaultValue={activeOrganizationId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
