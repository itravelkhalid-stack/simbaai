import { FinanceNav } from "@/components/finance/finance-nav";
import { FinanceSettingsForm } from "@/components/finance/settings-form";
import { getOrCreateFinanceSettings } from "@/lib/finance/metrics";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { BrandFinanceSettings } from "@/lib/types/finance";

export default async function FinanceSettingsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const rows = await Promise.all(
    (brands ?? []).map(async (b) => ({
      brand: b,
      settings: (await getOrCreateFinanceSettings(
        active.organization_id,
        b.id,
      )) as BrandFinanceSettings,
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Finance settings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Product cost assumptions for marketing gross margin.
        </p>
      </div>
      <FinanceNav current="/finance/settings" />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      ) : (
        <div className="space-y-4">
          {rows.map(({ brand, settings }) => (
            <FinanceSettingsForm
              key={brand.id}
              brandId={brand.id}
              brandName={brand.name}
              settings={settings}
            />
          ))}
        </div>
      )}
    </div>
  );
}
