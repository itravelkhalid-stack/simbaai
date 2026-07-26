import { notFound } from "next/navigation";

import { AdsNav } from "@/components/ads/ads-nav";
import { MetricCards, SpendBars } from "@/components/ads/metrics-widgets";
import {
  generateCreativesForCampaign,
  linkCampaignToPlatform,
  seedDemoMetrics,
} from "@/lib/ads/actions";
import {
  archiveAdCampaign,
  createCampaignsPaused,
  pauseAdCampaign,
  setCampaignLive,
  updateAdCampaignBudget,
} from "@/lib/ads/launch-actions";
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

  const [
    { data: metrics },
    { data: creatives },
    { data: connections },
    { data: brand },
  ] =
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
      supabase
        .from("brands")
        .select("website")
        .eq("id", c.brand_id)
        .eq("organization_id", active.organization_id)
        .maybeSingle(),
    ]);

  const rows = (metrics ?? []) as AdMetricDaily[];
  const agg = aggregateMetrics(rows);
  const creativeList = (creatives ?? []) as AdCreative[];
  const approvedCreatives = creativeList.filter(
    (creative) => creative.status === "approved",
  );
  const canWrite = active.role !== "org_viewer";
  const finalUrl =
    (typeof c.targeting?.final_url === "string"
      ? c.targeting.final_url
      : null) ??
    brand?.website ??
    "";
  const connection = ((connections ?? []) as AdConnection[]).find(
    (item) => item.id === c.connection_id,
  );
  const platformLink = c.platform_campaign_id
    ? c.platform === "meta"
      ? `https://www.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent((connection?.account_id ?? "").replace(/^act_/, ""))}&selected_campaign_ids=${encodeURIComponent(c.platform_campaign_id)}`
      : c.platform === "google"
        ? `https://ads.google.com/aw/campaigns?campaignId=${encodeURIComponent(c.platform_campaign_id)}&ocid=${encodeURIComponent(connection?.account_id ?? "")}`
        : null
    : null;

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

      <section className="space-y-4 rounded-xl border p-4">
        <div>
          <h2 className="font-medium">Platform launch</h2>
          <p className="text-sm text-muted-foreground">
            Creates the complete platform hierarchy PAUSED. Setting it live is a
            separate explicit approval and is checked against Ads → Settings
            limits.
          </p>
        </div>

        {c.platform_campaign_id ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-2 md:grid-cols-2">
              <p>
                Campaign ID:{" "}
                <code className="text-xs">{c.platform_campaign_id}</code>
              </p>
              <p>
                {c.platform === "meta" ? "Ad set" : "Ad group"} ID:{" "}
                <code className="text-xs">{c.platform_adset_id ?? "—"}</code>
              </p>
              <p>
                Ad ID: <code className="text-xs">{c.platform_ad_id ?? "—"}</code>
              </p>
              <p>
                Budget ID:{" "}
                <code className="text-xs">{c.platform_budget_id ?? "—"}</code>
              </p>
            </div>
            {platformLink ? (
              <a
                href={platformLink}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Open in {AD_PLATFORM_LABELS[c.platform]} ↗
              </a>
            ) : null}
            <p>
              Daily budget: {c.currency}{" "}
              {((c.daily_budget_pence ?? 0) / 100).toFixed(2)} · Local status:{" "}
              {c.status}
            </p>
            {c.status === "pending_approval" || c.status === "paused" ? (
              <form action={setCampaignLive}>
                <input type="hidden" name="campaignId" value={c.id} />
                <Button type="submit" disabled={!canWrite}>
                  Approve & set live
                </Button>
              </form>
            ) : null}
            {c.status === "active" ? (
              <form action={pauseAdCampaign}>
                <input type="hidden" name="campaignId" value={c.id} />
                <Button type="submit" variant="destructive" disabled={!canWrite}>
                  Pause campaign
                </Button>
              </form>
            ) : null}
            {c.status !== "archived" ? (
              <div className="flex flex-wrap gap-2">
                <form action={updateAdCampaignBudget} className="flex gap-2">
                  <input type="hidden" name="campaignId" value={c.id} />
                  <Input
                    name="dailyBudgetMajor"
                    type="number"
                    min="0.01"
                    step="0.01"
                    className="w-32"
                    defaultValue={(c.daily_budget_pence ?? 0) / 100}
                    aria-label="Daily budget"
                  />
                  <Button type="submit" variant="outline" disabled={!canWrite}>
                    Update budget
                  </Button>
                </form>
                <form action={archiveAdCampaign}>
                  <input type="hidden" name="campaignId" value={c.id} />
                  <Button type="submit" variant="outline" disabled={!canWrite}>
                    Archive
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        ) : c.platform === "meta" || c.platform === "google" ? (
          <form action={createCampaignsPaused} className="space-y-3">
            <input type="hidden" name="campaignId" value={c.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="finalUrl">Final destination URL</Label>
                <Input
                  id="finalUrl"
                  name="finalUrl"
                  type="url"
                  required
                  defaultValue={finalUrl}
                  placeholder="https://example.com/offer"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="countries">Country codes</Label>
                <Input
                  id="countries"
                  name="countries"
                  defaultValue={
                    Array.isArray(c.targeting?.countries)
                      ? (c.targeting.countries as string[]).join(", ")
                      : "GB"
                  }
                  placeholder="GB, US"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {approvedCreatives.length} approved creative(s). Meta requires one
              with an image. Google RSA requires 3 distinct headlines and 2
              descriptions from approved variants.
            </p>
            <Button
              type="submit"
              disabled={!canWrite || approvedCreatives.length === 0}
            >
              Create campaigns PAUSED
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Real writes remain stubbed for {AD_PLATFORM_LABELS[c.platform]}.
          </p>
        )}
      </section>

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
          {creativeList.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">No creatives yet.</li>
          ) : (
            creativeList.map((cr) => (
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
