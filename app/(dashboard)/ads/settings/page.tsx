import { AdsNav } from "@/components/ads/ads-nav";
import { AdLimitsForm } from "@/components/ads/ad-limits-form";
import { AdsSettingsForm } from "@/components/ads/settings-form";
import { getOrgAdLimits } from "@/lib/ads/launch-actions";
import { parseAdsSettings } from "@/lib/ads/settings";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { OrgAdLimits } from "@/lib/types/ads";

export default async function AdsSettingsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", active.organization_id)
    .single();
  const settings = parseAdsSettings(org?.settings as Record<string, unknown>);
  const limits = await getOrgAdLimits(active.organization_id);
  const [{ data: brands }, { data: allLimits }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", active.organization_id)
      .order("name"),
    supabase
      .from("org_ad_limits")
      .select("*")
      .eq("organization_id", active.organization_id)
      .not("brand_id", "is", null),
  ]);
  const brandLimits = new Map(
    ((allLimits ?? []) as OrgAdLimits[]).map((row) => [row.brand_id, row]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ads settings</h1>
        <p className="mt-2 text-muted-foreground">
          Auto-optimise never changes budgets beyond your daily cap, and pause/creative
          actions still require Apply in the recommendations feed.
        </p>
      </div>
      <AdsNav current="/ads/settings" />
      <AdLimitsForm limits={limits} />
      <div className="space-y-3">
        <h2 className="text-lg font-medium">Per-brand overrides</h2>
        {(brands ?? []).map((brand) => (
          <AdLimitsForm
            key={brand.id}
            brandId={brand.id}
            brandName={brand.name}
            limits={brandLimits.get(brand.id) ?? null}
          />
        ))}
      </div>
      <AdsSettingsForm settings={settings} />
    </div>
  );
}
