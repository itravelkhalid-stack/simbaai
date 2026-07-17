import { ComplianceNav } from "@/components/compliance/compliance-nav";
import { FindingBadges } from "@/components/compliance/findings-panel";
import { getOrCreateComplianceProfile } from "@/lib/compliance/check";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ComplianceCheck } from "@/lib/types/compliance";
import {
  COMPLIANCE_ENTITY_LABELS,
  COMPLIANCE_INDUSTRY_LABELS,
} from "@/lib/types/compliance";

export default async function ComplianceOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const brandId = params.brandId || brands?.[0]?.id;
  if (!brandId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Compliance</h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const profile = await getOrCreateComplianceProfile({
    organizationId: active.organization_id,
    brandId,
  });

  const { data: checks } = await supabase
    .from("compliance_checks")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("brand_id", brandId)
    .order("checked_at", { ascending: false })
    .limit(20);

  const list = (checks ?? []) as ComplianceCheck[];
  const fails = list.filter((c) => c.status === "fail" && !c.override_by).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Compliance</h1>
        <p className="mt-2 text-muted-foreground">
          Brand rule packs, automated checks on approval queues, audit trail, and
          GDPR data tools.
        </p>
      </div>
      <ComplianceNav current="/compliance" />

      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/compliance?brandId=${b.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Industry</p>
          <p className="mt-1 text-lg font-semibold">
            {COMPLIANCE_INDUSTRY_LABELS[profile.industry]}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Regulated</p>
          <p className="mt-1 text-lg font-semibold">
            {profile.regulated ? "Yes" : "No"}
          </p>
        </div>
        <div className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">Open fails</p>
          <p className="mt-1 text-lg font-semibold">{fails}</p>
        </div>
      </div>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-medium">Recent checks</h2>
        <ul className="divide-y text-sm">
          {list.length === 0 ? (
            <li className="py-2 text-muted-foreground">
              No checks yet. Items entering approval queues are checked
              automatically.
            </li>
          ) : (
            list.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div>
                  <p className="font-medium">
                    {COMPLIANCE_ENTITY_LABELS[c.entity_type]} ·{" "}
                    {c.entity_id.slice(0, 8)}…
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.checked_at).toLocaleString()} · {c.status}
                    {c.override_by ? " · overridden" : ""}
                  </p>
                </div>
                <FindingBadges findings={c.findings ?? []} />
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
