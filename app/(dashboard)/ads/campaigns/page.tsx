import Link from "next/link";

import { AdsNav } from "@/components/ads/ads-nav";
import { formatPence } from "@/lib/ads/metrics";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdCampaign } from "@/lib/types/ads";
import { AD_PLATFORM_LABELS } from "@/lib/types/ads";

export default async function AdsCampaignsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
        <p className="mt-2 text-muted-foreground">
          Managed campaigns from approved media plans. Link platform IDs to pull
          live metrics.
        </p>
      </div>
      <AdsNav current="/ads/campaigns" />
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as AdCampaign[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">
            No campaigns — approve a media plan first.
          </li>
        ) : (
          ((data ?? []) as AdCampaign[]).map((c) => (
            <li key={c.id} className="flex justify-between gap-3 p-4">
              <div>
                <Link href={`/ads/campaigns/${c.id}`} className="font-medium underline">
                  {c.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {AD_PLATFORM_LABELS[c.platform]} · {c.status}
                  {c.funnel_stage ? ` · ${c.funnel_stage}` : ""}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {c.daily_budget_pence != null
                  ? `${formatPence(c.daily_budget_pence, c.currency)}/day`
                  : "—"}
              </p>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
