import { createClient } from "@/lib/supabase/server";
import type {
  AnalyticsChannel,
  AnalyticsDaily,
  ChannelMixRow,
  CohortRow,
  FunnelTotals,
} from "@/lib/types/analytics";

export type DateRange = { from: string; to: string };

function sumField(
  rows: AnalyticsDaily[],
  field: keyof Pick<
    AnalyticsDaily,
    | "impressions"
    | "engagements"
    | "clicks"
    | "sessions"
    | "leads"
    | "sales"
    | "revenue_pence"
    | "spend_pence"
  >,
) {
  return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0);
}

function rate(num: number, den: number) {
  if (!den) return null;
  return Math.round((num / den) * 10000) / 100;
}

export async function fetchAnalyticsDaily(params: {
  organizationId: string;
  brandId: string;
  from: string;
  to: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analytics_daily")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .gte("metric_date", params.from)
    .lte("metric_date", params.to)
    .order("metric_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AnalyticsDaily[];
}

export function buildFunnel(rows: AnalyticsDaily[]): FunnelTotals {
  const impressions = sumField(rows, "impressions");
  const clicks = sumField(rows, "clicks");
  const leads = sumField(rows, "leads");
  const sales = sumField(rows, "sales");
  return {
    impressions,
    clicks,
    leads,
    sales,
    click_rate: rate(clicks, impressions),
    lead_rate: rate(leads, clicks),
    sale_rate: rate(sales, leads),
  };
}

export function buildChannelMix(rows: AnalyticsDaily[]): ChannelMixRow[] {
  const map = new Map<AnalyticsChannel, ChannelMixRow>();
  for (const r of rows) {
    if (r.channel === "all") continue;
    let row = map.get(r.channel);
    if (!row) {
      row = {
        channel: r.channel,
        spend_pence: 0,
        revenue_pence: 0,
        clicks: 0,
        sessions: 0,
        roas: null,
      };
      map.set(r.channel, row);
    }
    row.spend_pence += r.spend_pence;
    row.revenue_pence += r.revenue_pence;
    row.clicks += r.clicks;
    row.sessions += r.sessions;
  }
  return [...map.values()]
    .map((r) => ({
      ...r,
      roas:
        r.spend_pence > 0
          ? Math.round((r.revenue_pence / r.spend_pence) * 100) / 100
          : null,
    }))
    .sort((a, b) => b.spend_pence + b.revenue_pence - (a.spend_pence + a.revenue_pence));
}

export function buildDailySeries(rows: AnalyticsDaily[]) {
  const byDate = new Map<
    string,
    {
      date: string;
      impressions: number;
      clicks: number;
      sessions: number;
      spend_pence: number;
      revenue_pence: number;
    }
  >();
  for (const r of rows) {
    let row = byDate.get(r.metric_date);
    if (!row) {
      row = {
        date: r.metric_date,
        impressions: 0,
        clicks: 0,
        sessions: 0,
        spend_pence: 0,
        revenue_pence: 0,
      };
      byDate.set(r.metric_date, row);
    }
    row.impressions += r.impressions;
    row.clicks += r.clicks;
    row.sessions += r.sessions;
    row.spend_pence += r.spend_pence;
    row.revenue_pence += r.revenue_pence;
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function compareFunnels(current: FunnelTotals, prior: FunnelTotals) {
  const delta = (a: number, b: number) => {
    if (!b) return a ? 100 : null;
    return Math.round(((a - b) / b) * 1000) / 10;
  };
  return {
    impressions_delta_pct: delta(current.impressions, prior.impressions),
    clicks_delta_pct: delta(current.clicks, prior.clicks),
    leads_delta_pct: delta(current.leads, prior.leads),
    sales_delta_pct: delta(current.sales, prior.sales),
  };
}

export async function getTopContent(params: {
  organizationId: string;
  brandId: string;
  from: string;
  to: string;
  limit?: number;
}) {
  const supabase = await createClient();
  const fromIso = `${params.from}T00:00:00.000Z`;
  const toIso = `${params.to}T23:59:59.999Z`;

  const { data: items } = await supabase
    .from("content_items")
    .select("id, title, platform, copy")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .limit(200);

  if (!items?.length) return [];

  const ids = items.map((i) => i.id);
  const { data: metrics } = await supabase
    .from("content_metrics")
    .select("content_item_id, impressions, likes, comments, shares, saves, clicks")
    .eq("organization_id", params.organizationId)
    .in("content_item_id", ids)
    .gte("captured_at", fromIso)
    .lte("captured_at", toIso)
    .limit(5000);

  const byItem = new Map<
    string,
    { impressions: number; engagements: number; clicks: number }
  >();
  for (const m of metrics ?? []) {
    let row = byItem.get(m.content_item_id);
    if (!row) {
      row = { impressions: 0, engagements: 0, clicks: 0 };
      byItem.set(m.content_item_id, row);
    }
    row.impressions += m.impressions ?? 0;
    row.engagements +=
      (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
    row.clicks += m.clicks ?? 0;
  }

  return items
    .map((item) => {
      const m = byItem.get(item.id) ?? {
        impressions: 0,
        engagements: 0,
        clicks: 0,
      };
      return {
        id: item.id,
        title: item.title || item.copy.slice(0, 60) || "Untitled",
        platform: item.platform,
        ...m,
      };
    })
    .filter((r) => r.impressions + r.engagements + r.clicks > 0)
    .sort((a, b) => b.engagements - a.engagements)
    .slice(0, params.limit ?? 8);
}

export async function getTopCampaigns(params: {
  organizationId: string;
  brandId: string;
  from: string;
  to: string;
  limit?: number;
}) {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("id, name, platform")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .limit(100);

  if (!campaigns?.length) return [];

  const ids = campaigns.map((c) => c.id);
  const { data: metrics } = await supabase
    .from("ad_metrics_daily")
    .select(
      "campaign_id, spend_pence, impressions, clicks, conversions, revenue_pence",
    )
    .eq("organization_id", params.organizationId)
    .in("campaign_id", ids)
    .gte("metric_date", params.from)
    .lte("metric_date", params.to)
    .limit(5000);

  const byCampaign = new Map<
    string,
    {
      spend_pence: number;
      impressions: number;
      clicks: number;
      conversions: number;
      revenue_pence: number;
    }
  >();
  for (const m of metrics ?? []) {
    let row = byCampaign.get(m.campaign_id);
    if (!row) {
      row = {
        spend_pence: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue_pence: 0,
      };
      byCampaign.set(m.campaign_id, row);
    }
    row.spend_pence += m.spend_pence ?? 0;
    row.impressions += m.impressions ?? 0;
    row.clicks += m.clicks ?? 0;
    row.conversions += Number(m.conversions ?? 0);
    row.revenue_pence += m.revenue_pence ?? 0;
  }

  return campaigns
    .map((c) => {
      const m = byCampaign.get(c.id) ?? {
        spend_pence: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        revenue_pence: 0,
      };
      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        ...m,
        roas:
          m.spend_pence > 0
            ? Math.round((m.revenue_pence / m.spend_pence) * 100) / 100
            : null,
      };
    })
    .filter((r) => r.spend_pence + r.impressions > 0)
    .sort((a, b) => b.spend_pence - a.spend_pence)
    .slice(0, params.limit ?? 8);
}

/** Cohort: revenue by contact acquisition month (requires crm_orders). */
export async function getRevenueByAcquisitionMonth(params: {
  organizationId: string;
  brandId: string;
}): Promise<CohortRow[]> {
  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("crm_orders")
    .select("contact_id, order_total_pence, ordered_at")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .limit(5000);

  if (!orders?.length) return [];

  const contactIds = [...new Set(orders.map((o) => o.contact_id))];
  const { data: contacts } = await supabase
    .from("crm_contacts")
    .select("id, created_at")
    .eq("organization_id", params.organizationId)
    .in("id", contactIds.slice(0, 1000));

  const acquired = new Map(
    (contacts ?? []).map((c) => [c.id, c.created_at.slice(0, 7)]),
  );

  const map = new Map<string, CohortRow>();
  for (const o of orders) {
    const month = acquired.get(o.contact_id);
    if (!month) continue;
    let row = map.get(month);
    if (!row) {
      row = { acquisition_month: month, revenue_pence: 0, orders: 0 };
      map.set(month, row);
    }
    row.revenue_pence += o.order_total_pence ?? 0;
    row.orders += 1;
  }

  return [...map.values()].sort((a, b) =>
    a.acquisition_month.localeCompare(b.acquisition_month),
  );
}

export function shiftRange(range: DateRange, days: number): DateRange {
  const from = new Date(`${range.from}T00:00:00.000Z`);
  const to = new Date(`${range.to}T00:00:00.000Z`);
  from.setUTCDate(from.getUTCDate() - days);
  to.setUTCDate(to.getUTCDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export function rangeLengthDays(range: DateRange) {
  const from = new Date(`${range.from}T00:00:00.000Z`).getTime();
  const to = new Date(`${range.to}T00:00:00.000Z`).getTime();
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

export function defaultDateRange(days = 30): DateRange {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
