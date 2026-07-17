import { deriveMetrics } from "@/lib/ads/providers/http";
import { getAdsProvider } from "@/lib/ads/providers";
import { decryptAdConnection } from "@/lib/ads/connections";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdCampaign, AdConnection } from "@/lib/types/ads";

export { aggregateMetrics } from "@/lib/ads/metric-math";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export async function syncCampaignMetrics(params: {
  campaign: AdCampaign;
  connection: AdConnection;
  days?: number;
}) {
  if (!params.campaign.platform_campaign_id) {
    return { synced: 0, reason: "no_platform_campaign_id" as const };
  }

  const provider = getAdsProvider(params.campaign.platform);
  const tokens = decryptAdConnection(params.connection);
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - (params.days ?? 14));

  const rows = await provider.fetchDailyMetrics({
    accessToken: tokens.accessToken,
    accountId: params.connection.account_id,
    platformCampaignId: params.campaign.platform_campaign_id,
    since: isoDate(since),
    until: isoDate(until),
  });

  const supabase = createAdminClient();
  let synced = 0;
  for (const row of rows) {
    const derived = deriveMetrics({
      spendPence: row.spendPence,
      impressions: row.impressions,
      clicks: row.clicks,
      revenuePence: row.revenuePence,
    });
    const { error } = await supabase.from("ad_metrics_daily").upsert(
      {
        organization_id: params.campaign.organization_id,
        campaign_id: params.campaign.id,
        metric_date: row.date,
        spend_pence: row.spendPence,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        revenue_pence: row.revenuePence,
        cpm: derived.cpm,
        cpc_pence: derived.cpcPence,
        ctr: derived.ctr,
        roas: derived.roas,
        currency: row.currency ?? params.campaign.currency,
        raw: row.raw ?? {},
      },
      { onConflict: "campaign_id,metric_date" },
    );
    if (!error) synced += 1;
  }

  await supabase
    .from("ad_campaigns")
    .update({ last_sync_at: new Date().toISOString(), last_error: null })
    .eq("id", params.campaign.id);

  return { synced, reason: "ok" as const };
}

export async function syncAllManagedCampaignMetrics(limit = 50) {
  const supabase = createAdminClient();
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("is_managed", true)
    .not("platform_campaign_id", "is", null)
    .in("status", ["active", "paused", "approved"])
    .limit(limit);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const campaign of (campaigns ?? []) as AdCampaign[]) {
    if (!campaign.connection_id) {
      results.push({ id: campaign.id, ok: false, error: "no connection" });
      continue;
    }
    const { data: connection } = await supabase
      .from("ad_connections")
      .select("*")
      .eq("id", campaign.connection_id)
      .maybeSingle();
    if (!connection) {
      results.push({ id: campaign.id, ok: false, error: "connection missing" });
      continue;
    }
    try {
      await syncCampaignMetrics({
        campaign,
        connection: connection as AdConnection,
      });
      results.push({ id: campaign.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "sync failed";
      await supabase
        .from("ad_campaigns")
        .update({ last_error: message })
        .eq("id", campaign.id);
      results.push({ id: campaign.id, ok: false, error: message });
    }
  }
  return results;
}

export { formatPence } from "@/lib/ads/format";
