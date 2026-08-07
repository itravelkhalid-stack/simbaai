import { BrandAutonomyForm } from "@/components/brand/autonomy-form";
import { BrandNav } from "@/components/brand/brand-nav";
import { parseBrandAutonomy } from "@/lib/autonomy/settings";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types/research";

export default async function BrandAutonomyPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: brands, error } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);

  const list = (brands ?? []) as Brand[];
  const canWrite =
    active.role === "org_owner" || active.role === "org_admin";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Autonomy</h1>
        <p className="mt-2 text-muted-foreground">
          Choose approval vs autonomous operation per brand, set ROAS/CPA pause
          thresholds, and use the kill switch to halt all agent activity.
        </p>
      </div>

      <BrandNav current="/brand/autonomy" />

      {list.length === 0 ? (
        <p className="text-muted-foreground">
          Create a brand first, then configure autonomy.
        </p>
      ) : (
        <div className="space-y-6">
          {list.map((brand) => (
            <BrandAutonomyForm
              key={brand.id}
              brandId={brand.id}
              brandName={brand.name}
              settings={parseBrandAutonomy(brand)}
              canWrite={canWrite}
              monthlyAdBudgetPence={brand.monthly_ad_budget_pence ?? null}
              monthlyAdBudgetCurrency={
                brand.monthly_ad_budget_currency ?? "GBP"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
