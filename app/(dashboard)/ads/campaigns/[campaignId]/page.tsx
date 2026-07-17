import { notFound } from "next/navigation";

import { AdsNav } from "@/components/ads/ads-nav";
import { MetricCards, SpendBars } from "@/components/ads/metrics-widgets";
import {
  generateCreativesForCampaign,
  linkCampaignToPlatform,
  seedDemoMetrics,
} from "@/lib/ads/actions";
import { aggregateMetrics } from "@/lib/ads/metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  AdCampaign,
  AdConnection,
  AdCreative,
  AdMetricDaily,
} from "@/lib/types/ads";
import { AD_PLATFORM_LABELS } from "@/lib/types/ads";

export default async function AdsCampaignDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!campaign) notFound();

  const c = campaign as AdCampaign;
  const since = new Date();
  since.setDate(since.getDate() - 14);

  const [{ data: metrics }, { data: creatives }, { data: connections }] =
    await Promise.all([
      supabase
        .from("ad_metrics_daily")
        .select("*")
        .eq("campaign_id", campaignId)
        .gte("metric_date", since.toISOString().slice(0, 10))
        .order("metric_date"),
      supabase
        .from("ad_creatives")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false }),
      supabase
        .from("ad_connections")
        .select("*")
        .eq("organization_id", active.organization_id)
        .eq("platform", c.platform),
    ]);

  const rows = (metrics ?? []) as AdMetricDaily[];
  const agg = aggregateMetrics(rows);

  return (
    <div className="space-y-6">
      <div>
        <AdsNav current="/ads/campaigns" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{c.name}</h1>
        <p className="text-sm text-muted-foreground">
          {AD_PLATFORM_LABELS[c.platform]} · {c.status}
          {c.objective ? ` · ${c.objective}` : ""}
        </p>
      </div>

      <MetricCards
        spend={agg.spend_pence}
        impressions={agg.impressions}
        clicks={agg.clicks}
        conversions={agg.conversions}
        roas={agg.roas}
        cpm={agg.cpm}
        cpc={agg.cpcPence}
        ctr={agg.ctr}
        currency={c.currency}
      />

      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-medium">Spend (14d)</p>
        <SpendBars
          days={rows.map((r) => ({
            date: r.metric_date,
            spend_pence: r.spend_pence,
          }))}
        />
      </div>

      <form action={linkCampaignToPlatform} className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Link platform campaign</p>
        <input type="hidden" name="campaignId" value={c.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="platformCampaignId">Platform campaign ID</Label>
            <Input
              id="platformCampaignId"
              name="platformCampaignId"
              defaultValue={c.platform_campaign_id ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="connectionId">Connection</Label>
            <select
              id="connectionId"
              name="connectionId"
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              defaultValue={c.connection_id ?? ""}
            >
              <option value="">None</option>
              {((connections ?? []) as AdConnection[]).map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.account_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Button type="submit" size="sm">
          Save link
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <form action={generateCreativesForCampaign}>
          <input type="hidden" name="campaignId" value={c.id} />
          <Button type="submit">Generate AI creative variants</Button>
        </form>
        <form action={seedDemoMetrics}>
          <input type="hidden" name="campaignId" value={c.id} />
          <Button type="submit" variant="outline">
            Seed demo metrics
          </Button>
        </form>
      </div>

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Creatives</div>
        <ul className="divide-y">
          {((creatives ?? []) as AdCreative[]).length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">No creatives yet.</li>
          ) : (
            ((creatives ?? []) as AdCreative[]).map((cr) => (
              <li key={cr.id} className="space-y-1 p-4 text-sm">
                <p className="font-medium">
                  {cr.variant_label ?? "Variant"} · {cr.status}
                </p>
                <p>{cr.headline}</p>
                <p className="text-muted-foreground">{cr.primary_text}</p>
                {cr.hook ? <p>Hook: {cr.hook}</p> : null}
                <p className="text-xs text-muted-foreground">CTA: {cr.cta}</p>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
