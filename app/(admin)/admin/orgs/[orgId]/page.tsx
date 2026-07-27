import { notFound } from "next/navigation";

import {
  setOrgFeatureFlag,
  setOrgPlan,
  startImpersonation,
} from "@/lib/admin/actions";
import { ALL_ORG_PLANS, formatPlanLimit, getUsageSnapshot } from "@/lib/billing/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_LIMITS } from "@/lib/types/finance";
import { KNOWN_FEATURE_FLAGS } from "@/lib/types/platform";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) notFound();

  const usage = await getUsageSnapshot(org.id);
  const { data: flags } = await admin
    .from("org_feature_flags")
    .select("*")
    .eq("organization_id", orgId);
  const flagMap = new Map((flags ?? []).map((f) => [f.flag_key, f.enabled]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{org.name}</h2>
          <p className="mt-1 text-muted-foreground">
            {org.slug} · plan {org.plan}
          </p>
        </div>
        <form action={startImpersonation}>
          <input type="hidden" name="organizationId" value={org.id} />
          <Button type="submit" variant="outline">
            Impersonate org
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Plan override</CardTitle>
          <CardDescription>
            Set any org plan without Stripe. Use{" "}
            <span className="font-medium">internal</span> for platform-owned /
            demo orgs (unlimited limits, not purchasable).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            {(
              [
                "brands",
                "ai_runs_month",
                "connected_channels",
                "team_members",
              ] as const
            ).map((key) => (
              <div key={key} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">
                  {key.replaceAll("_", " ")}
                </p>
                <p className="font-semibold">
                  {usage.usage[key]} / {formatPlanLimit(usage.limits[key])}
                </p>
              </div>
            ))}
          </div>
          <form action={setOrgPlan} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="organizationId" value={org.id} />
            <div className="space-y-2">
              <Label htmlFor="plan">Plan</Label>
              <select
                id="plan"
                name="plan"
                defaultValue={org.plan}
                className="flex h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {ALL_ORG_PLANS.map((plan) => (
                  <option key={plan} value={plan}>
                    {PLAN_LIMITS[plan].label}
                    {plan === "internal" ? " (not Stripe)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Save plan</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
          <CardDescription>Per-organization capability toggles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {KNOWN_FEATURE_FLAGS.map((flag) => (
            <form
              key={flag.key}
              action={setOrgFeatureFlag}
              className="flex items-center justify-between gap-4 rounded-lg border px-4 py-3"
            >
              <input type="hidden" name="organizationId" value={org.id} />
              <input type="hidden" name="flagKey" value={flag.key} />
              <div>
                <p className="font-medium">{flag.label}</p>
                <p className="text-xs text-muted-foreground">{flag.key}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  value="on"
                  defaultChecked={Boolean(flagMap.get(flag.key))}
                />
                Enabled
              </label>
              <Button type="submit" size="sm" variant="secondary">
                Save
              </Button>
            </form>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
