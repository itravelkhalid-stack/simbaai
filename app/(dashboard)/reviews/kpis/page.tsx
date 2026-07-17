import { KpiConfigForm } from "@/components/reviews/kpi-config-form";
import { ReviewsNav } from "@/components/reviews/reviews-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { BrandKpi } from "@/lib/types/reviews";

export default async function ReviewsKpisPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const { data: kpis } = await supabase
    .from("brand_kpis")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("sort_order", { ascending: true });

  const byBrand = new Map<string, BrandKpi[]>();
  for (const kpi of (kpis ?? []) as BrandKpi[]) {
    const list = byBrand.get(kpi.brand_id) ?? [];
    list.push(kpi);
    byBrand.set(kpi.brand_id, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Brand KPIs</h1>
        <p className="mt-2 text-muted-foreground">
          Define north-star metrics and targets. Report agents measure commentary against
          these.
        </p>
      </div>
      <ReviewsNav current="/reviews/kpis" />
      {(brands ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      ) : (
        <div className="space-y-6">
          {(brands ?? []).map((brand) => (
            <KpiConfigForm
              key={brand.id}
              brandId={brand.id}
              brandName={brand.name}
              kpis={byBrand.get(brand.id) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
