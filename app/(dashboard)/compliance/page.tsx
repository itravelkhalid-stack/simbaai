import { ComplianceNav } from "@/components/compliance/compliance-nav";
import { FindingBadges } from "@/components/compliance/findings-panel";
import { EmptyState } from "@/components/brand/empty-state";
import { MetricCard } from "@/components/brand/metric-card";
import { getOrCreateComplianceProfile } from "@/lib/compliance/check";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import type { ComplianceCheck } from "@/lib/types/compliance";
import {
  COMPLIANCE_ENTITY_LABELS,
  COMPLIANCE_INDUSTRY_LABELS,
} from "@/lib/types/compliance";
import { cn } from "@/lib/utils";

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
      <div className="space-y-6">
        <PageHeader
          title="Compliance"
          description="Brand rule packs and approval-queue checks."
        />
        <EmptyState
          title="Create a brand to protect"
          description="Compliance profiles are per brand — set up your kit first, then Simba checks every publishable draft."
          actionLabel="Set up brand"
          actionHref="/brand"
        />
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
      <PageHeader
        title="Compliance"
        description={
          <>
            Brand rule packs, automated checks on approval queues, audit trail, and
            GDPR data tools.
          </>
        }
      />
      <ComplianceNav current="/compliance" />

      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/compliance?brandId=${b.id}`}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm",
              b.id === brandId
                ? "bg-brand-soft font-medium text-primary"
                : "text-ink-soft ring-1 ring-border hover:bg-surface-soft",
            )}
          >
            {b.name}
          </a>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Industry"
          value={COMPLIANCE_INDUSTRY_LABELS[profile.industry]}
        />
        <MetricCard
          label="Regulated"
          value={profile.regulated ? "Yes" : "No"}
        />
        <MetricCard label="Open fails" value={String(fails)} />
      </div>

      <section className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
        <h2 className="mb-3 text-sm font-medium">Recent checks</h2>
        {list.length === 0 ? (
          <EmptyState
            title="Checks appear when work is ready"
            description="Items entering approval queues are automatically checked against your brand rules and compliance profile."
            className="py-8"
          />
        ) : (
        <ul className="divide-y text-sm">
            {list.map((c) => (
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
            ))}
        </ul>
        )}
      </section>
    </div>
  );
}
