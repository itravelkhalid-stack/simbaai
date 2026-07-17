import { createAdminClient } from "@/lib/supabase/admin";
import { platformToFinanceChannel } from "@/lib/types/finance";
import type { AnalyticsChannel } from "@/lib/types/analytics";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function emptyBucket() {
  return {
    impressions: 0,
    engagements: 0,
    clicks: 0,
    sessions: 0,
    leads: 0,
    sales: 0,
    revenue_pence: 0,
    spend_pence: 0,
  };
}

type Bucket = ReturnType<typeof emptyBucket>;

function key(brandId: string, date: string, channel: AnalyticsChannel) {
  return `${brandId}|${date}|${channel}`;
}

function toAnalyticsChannel(platform: string): AnalyticsChannel {
  const c = platformToFinanceChannel(platform);
  if (c === "platform") return "other";
  return c as AnalyticsChannel;
}

/** Nightly: rebuild analytics_daily for the last N days from module metrics. */
export async function buildAnalyticsDailyRollups(daysBack = 14) {
  const supabase = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceDate = isoDate(since);
  const sinceIso = since.toISOString();

  const map = new Map<string, Bucket & { organization_id: string; brand_id: string; metric_date: string; channel: AnalyticsChannel }>();

  const ensure = (
    organizationId: string,
    brandId: string,
    date: string,
    channel: AnalyticsChannel,
  ) => {
    const k = key(brandId, date, channel);
    let row = map.get(k);
    if (!row) {
      row = {
        organization_id: organizationId,
        brand_id: brandId,
        metric_date: date,
        channel,
        ...emptyBucket(),
      };
      map.set(k, row);
    }
    return row;
  };

  // Ads
  const { data: adMetrics } = await supabase
    .from("ad_metrics_daily")
    .select("organization_id, campaign_id, metric_date, spend_pence, impressions, clicks, conversions, revenue_pence")
    .gte("metric_date", sinceDate)
    .limit(10000);

  const campaignIds = [...new Set((adMetrics ?? []).map((m) => m.campaign_id))];
  const { data: campaigns } = campaignIds.length
    ? await supabase
        .from("ad_campaigns")
        .select("id, brand_id, platform")
        .in("id", campaignIds)
    : { data: [] as Array<{ id: string; brand_id: string; platform: string }> };
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

  for (const m of adMetrics ?? []) {
    const campaign = campaignById.get(m.campaign_id);
    if (!campaign) continue;
    const channel = toAnalyticsChannel(campaign.platform);
    const row = ensure(m.organization_id, campaign.brand_id, m.metric_date, channel);
    row.spend_pence += m.spend_pence ?? 0;
    row.impressions += m.impressions ?? 0;
    row.clicks += m.clicks ?? 0;
    row.sales += Number(m.conversions ?? 0);
    row.revenue_pence += m.revenue_pence ?? 0;
  }

  // Content metrics
  const { data: contentMetrics } = await supabase
    .from("content_metrics")
    .select(
      "organization_id, content_item_id, impressions, likes, comments, shares, saves, clicks, captured_at",
    )
    .gte("captured_at", sinceIso)
    .limit(10000);

  const contentIds = [
    ...new Set((contentMetrics ?? []).map((m) => m.content_item_id)),
  ];
  const { data: contentItems } = contentIds.length
    ? await supabase
        .from("content_items")
        .select("id, brand_id, platform")
        .in("id", contentIds.slice(0, 500))
    : { data: [] as Array<{ id: string; brand_id: string; platform: string }> };
  const contentById = new Map((contentItems ?? []).map((c) => [c.id, c]));

  for (const m of contentMetrics ?? []) {
    const item = contentById.get(m.content_item_id);
    if (!item) continue;
    const date = String(m.captured_at).slice(0, 10);
    const channel: AnalyticsChannel = "content";
    const row = ensure(m.organization_id, item.brand_id, date, channel);
    row.impressions += m.impressions ?? 0;
    row.engagements +=
      (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
    row.clicks += m.clicks ?? 0;
  }

  // Email events
  const { data: emailEvents } = await supabase
    .from("email_events")
    .select("organization_id, event_type, occurred_at, campaign_id")
    .gte("occurred_at", sinceIso)
    .limit(20000);

  const emailCampaignIds = [
    ...new Set(
      (emailEvents ?? [])
        .map((e) => e.campaign_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: emailCampaigns } = emailCampaignIds.length
    ? await supabase
        .from("email_campaigns")
        .select("id, brand_id")
        .in("id", emailCampaignIds)
    : { data: [] as Array<{ id: string; brand_id: string }> };
  const emailBrandByCampaign = new Map(
    (emailCampaigns ?? []).map((c) => [c.id, c.brand_id]),
  );

  // Fallback: org primary brand for events without campaign
  const { data: brands } = await supabase.from("brands").select("id, organization_id, is_primary");
  const primaryBrand = new Map<string, string>();
  for (const b of brands ?? []) {
    if (b.is_primary) primaryBrand.set(b.organization_id, b.id);
    else if (!primaryBrand.has(b.organization_id)) {
      primaryBrand.set(b.organization_id, b.id);
    }
  }

  for (const e of emailEvents ?? []) {
    const brandId =
      (e.campaign_id ? emailBrandByCampaign.get(e.campaign_id) : null) ??
      primaryBrand.get(e.organization_id);
    if (!brandId) continue;
    const date = e.occurred_at.slice(0, 10);
    const row = ensure(e.organization_id, brandId, date, "email");
    if (e.event_type === "delivered" || e.event_type === "sent") {
      row.impressions += 1;
    }
    if (e.event_type === "opened") row.engagements += 1;
    if (e.event_type === "clicked") row.clicks += 1;
  }

  // SEO GSC
  const { data: gsc } = await supabase
    .from("seo_gsc_daily")
    .select("organization_id, project_id, metric_date, impressions, clicks")
    .gte("metric_date", sinceDate)
    .limit(10000);
  const projectIds = [...new Set((gsc ?? []).map((g) => g.project_id))];
  const { data: seoProjects } = projectIds.length
    ? await supabase
        .from("seo_projects")
        .select("id, brand_id")
        .in("id", projectIds)
    : { data: [] as Array<{ id: string; brand_id: string }> };
  const seoBrand = new Map((seoProjects ?? []).map((p) => [p.id, p.brand_id]));

  for (const g of gsc ?? []) {
    const brandId = seoBrand.get(g.project_id);
    if (!brandId) continue;
    const row = ensure(g.organization_id, brandId, g.metric_date, "seo");
    row.impressions += g.impressions ?? 0;
    row.clicks += g.clicks ?? 0;
  }

  // CRM leads (contacts created) + sales/revenue from orders
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("organization_id, brand_id, created_at, lifecycle_stage")
    .gte("created_at", sinceIso)
    .limit(5000);
  for (const c of contacts ?? []) {
    const date = c.created_at.slice(0, 10);
    const row = ensure(c.organization_id, c.brand_id, date, "crm");
    row.leads += 1;
  }

  const { data: orders } = await supabase
    .from("crm_orders")
    .select("organization_id, brand_id, ordered_at, order_total_pence")
    .gte("ordered_at", sinceIso)
    .limit(5000);
  for (const o of orders ?? []) {
    const date = o.ordered_at.slice(0, 10);
    const row = ensure(o.organization_id, o.brand_id, date, "crm");
    row.sales += 1;
    row.revenue_pence += o.order_total_pence ?? 0;
  }

  // Finance revenue_records (manual / shopify) — attribute to crm/web
  const { data: rev } = await supabase
    .from("revenue_records")
    .select("organization_id, brand_id, revenue_date, amount_pence, orders_count, source")
    .gte("revenue_date", sinceDate)
    .limit(5000);
  for (const r of rev ?? []) {
    const channel: AnalyticsChannel =
      r.source === "shopify" || r.source === "woo" ? "web" : "crm";
    const row = ensure(r.organization_id, r.brand_id, r.revenue_date, channel);
    row.revenue_pence += r.amount_pence ?? 0;
    row.sales += r.orders_count ?? 0;
  }

  // Finance expenses (if rollup not already covered by ads)
  // Skip — ads already covered

  // GA4 sessions into web channel
  const { data: ga4 } = await supabase
    .from("analytics_ga4_daily")
    .select("organization_id, brand_id, metric_date, sessions, conversions")
    .gte("metric_date", sinceDate)
    .limit(10000);
  for (const g of ga4 ?? []) {
    const row = ensure(g.organization_id, g.brand_id, g.metric_date, "web");
    row.sessions += g.sessions ?? 0;
    row.leads += Math.round(Number(g.conversions ?? 0));
  }

  let upserted = 0;
  const rows = [...map.values()];
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { error } = await supabase.from("analytics_daily").upsert(
      chunk.map((r) => ({
        organization_id: r.organization_id,
        brand_id: r.brand_id,
        metric_date: r.metric_date,
        channel: r.channel,
        impressions: r.impressions,
        engagements: r.engagements,
        clicks: r.clicks,
        sessions: r.sessions,
        leads: r.leads,
        sales: r.sales,
        revenue_pence: r.revenue_pence,
        spend_pence: r.spend_pence,
      })),
      { onConflict: "brand_id,metric_date,channel" },
    );
    if (!error) upserted += chunk.length;
  }

  return { upserted, daysBack };
}
