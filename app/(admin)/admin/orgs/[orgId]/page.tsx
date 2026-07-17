import { notFound } from "next/navigation";

import {
  setOrgFeatureFlag,
  setOrgPlan,
  startImpersonation,
} from "@/lib/admin/actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { KNOWN_FEATURE_FLAGS } from "@/lib/types/platform";
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
          <CardTitle>Plan</CardTitle>
          <CardDescription>Override billing plan for support.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={setOrgPlan} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="organizationId" value={org.id} />
            <div className="space-y-2">
              <Label htmlFor="plan">Plan</Label>
              <Input
                id="plan"
                name="plan"
                defaultValue={org.plan}
                placeholder="free | starter | growth | agency"
              />
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
