import { AdsNav } from "@/components/ads/ads-nav";
import { BudgetPotPanel } from "@/components/ads/budget-pot-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/brand/empty-state";
import { loadBrandBudgetOverview } from "@/lib/ads/budget-overview";
import { formatPaceHint } from "@/lib/ads/budget-overview";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function AdsBudgetsPage({
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
          title="Ad budgets"
          description="One combined monthly pot across every ad platform."
        />
        <AdsNav current="/ads/budgets" />
        <EmptyState
          title="Create a brand first"
          description="Budgets are scoped per brand."
          actionLabel="Set up brand"
          actionHref="/brand"
        />
      </div>
    );
  }

  const brand = (brands ?? []).find((b) => b.id === brandId) ?? {
    id: brandId,
    name: "Brand",
  };
  const overview = await loadBrandBudgetOverview({
    organizationId: active.organization_id,
    brandId,
    brandName: brand.name,
  });
  const canWrite = active.role !== "org_viewer";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ad budgets"
        description="The monthly pot is shared across Meta, Google, and any future platforms. Optional splits are hard constraints; org hard limits always win."
      />
      <AdsNav current="/ads/budgets" />

      {(brands ?? []).length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {(brands ?? []).map((b) => (
            <a
              key={b.id}
              href={`/ads/budgets?brandId=${b.id}`}
              className={
                b.id === brandId
                  ? "rounded-full bg-[var(--sem-accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--sem-primary)]"
                  : "rounded-full border border-[var(--sem-border)] px-3 py-1.5 text-sm text-[var(--sem-ink-soft)]"
              }
            >
              {b.name}
            </a>
          ))}
        </div>
      ) : null}

      <p className="text-sm text-[var(--sem-ink-soft)]">
        {formatPaceHint(overview)}
      </p>

      <BudgetPotPanel overview={overview} canWrite={canWrite} />
    </div>
  );
}
