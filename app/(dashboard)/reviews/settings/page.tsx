import { ReportSettingsForm } from "@/components/reviews/settings-form";
import { ReviewsNav } from "@/components/reviews/reviews-nav";
import { getOrCreateBrandReportSettings } from "@/lib/reviews/periods";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function ReviewsSettingsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const settingsList = await Promise.all(
    (brands ?? []).map(async (b) => ({
      brand: b,
      settings: await getOrCreateBrandReportSettings(
        active.organization_id,
        b.id,
      ),
    })),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Report schedule</h1>
        <p className="mt-2 text-muted-foreground">
          Per-brand cadence: daily overnight, weekly Monday mornings, monthly on the 1st,
          quarterly on the first of the quarter — all UTC hours configurable.
        </p>
      </div>
      <ReviewsNav current="/reviews/settings" />
      {settingsList.length === 0 ? (
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      ) : (
        <div className="space-y-6">
          {settingsList.map(({ brand, settings }) => (
            <ReportSettingsForm
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
