import { AdsNav } from "@/components/ads/ads-nav";
import { AdsSettingsForm } from "@/components/ads/settings-form";
import { parseAdsSettings } from "@/lib/ads/settings";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export default async function AdsSettingsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", active.organization_id)
    .single();
  const settings = parseAdsSettings(org?.settings as Record<string, unknown>);

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
      <AdsSettingsForm settings={settings} />
    </div>
  );
}
