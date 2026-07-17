import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandContext } from "@/lib/brand/context";
import {
  deltaPct,
  listBrandKpis,
} from "@/lib/reviews/periods";
import type { BrandKpi, ReportChartPoint, ReportType } from "@/lib/types/reviews";

type PeriodBounds = {
  periodStart: string;
  periodEnd: string;
  previousStart: string;
  previousEnd: string;
};

async function sumAdMetrics(
  organizationId: string,
  from: string,
  to: string,
) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ad_metrics_daily")
    .select("metric_date, spend_pence, impressions, clicks, conversions, revenue_pence")
    .eq("organization_id", organizationId)
    .gte("metric_date", from)
    .lte("metric_date", to);
  const rows = data ?? [];
  const spend = rows.reduce((s, r) => s + (r.spend_pence ?? 0), 0);
  const revenue = rows.reduce((s, r) => s + (r.revenue_pence ?? 0), 0);
  const clicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const impressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const conversions = rows.reduce((s, r) => s + Number(r.conversions ?? 0), 0);
  return {
    spend_pence: spend,
    revenue_pence: revenue,
    clicks,
    impressions,
    conversions,
    roas: spend > 0 ? revenue / spend : 0,
    rows,
  };
}

async function sumContentMetrics(
  organizationId: string,
  brandId: string,
  fromIso: string,
  toIso: string,
) {
  const supabase = createAdminClient();
  const { data: items } = await supabase
    .from("content_items")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("brand_id", brandId);
  const ids = (items ?? []).map((i) => i.id);
  if (!ids.length) {
    return { impressions: 0, engagements: 0, clicks: 0, published: 0, rows: [] as never[] };
  }

  const from = `${fromIso}T00:00:00.000Z`;
  const to = `${toIso}T23:59:59.999Z`;
  const { data } = await supabase
    .from("content_metrics")
    .select("content_item_id, impressions, likes, comments, shares, saves, clicks, captured_at")
    .eq("organization_id", organizationId)
    .in("content_item_id", ids.slice(0, 200))
    .gte("captured_at", from)
    .lte("captured_at", to)
    .limit(500);

  const rows = data ?? [];
  const impressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  const engagements = rows.reduce(
    (s, r) =>
      s +
      (r.likes ?? 0) +
      (r.comments ?? 0) +
      (r.shares ?? 0) +
      (r.saves ?? 0),
    0,
  );
  const clicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);

  const { count } = await supabase
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("brand_id", brandId)
    .eq("status", "published")
    .gte("published_at", from)
    .lte("published_at", to);

  return {
    impressions,
    engagements,
    clicks,
    published: count ?? 0,
    rows,
  };
}

async function sumEmailEvents(
  organizationId: string,
  fromIso: string,
  toIso: string,
) {
  const supabase = createAdminClient();
  const from = `${fromIso}T00:00:00.000Z`;
  const to = `${toIso}T23:59:59.999Z`;
  const { data } = await supabase
    .from("email_events")
    .select("event_type, occurred_at")
    .eq("organization_id", organizationId)
    .gte("occurred_at", from)
    .lte("occurred_at", to)
    .limit(5000);

  const rows = data ?? [];
  const count = (type: string) =>
    rows.filter((r) => r.event_type === type).length;
  return {
    sent: count("sent") + count("delivered"),
    opens: count("opened"),
    clicks: count("clicked"),
    bounces: count("bounced"),
    unsubscribes: count("unsubscribed") + count("complained"),
    rows,
  };
}

async function sumSeo(
  organizationId: string,
  brandId: string,
  from: string,
  to: string,
) {
  const supabase = createAdminClient();
  const { data: projects } = await supabase
    .from("seo_projects")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("brand_id", brandId);
  const ids = (projects ?? []).map((p) => p.id);
  if (!ids.length) {
    return { clicks: 0, impressions: 0, rows: [] as never[] };
  }
  const { data } = await supabase
    .from("seo_gsc_daily")
    .select("metric_date, clicks, impressions, ctr, position")
    .eq("organization_id", organizationId)
    .in("project_id", ids)
    .gte("metric_date", from)
    .lte("metric_date", to);
  const rows = data ?? [];
  return {
    clicks: rows.reduce((s, r) => s + (r.clicks ?? 0), 0),
    impressions: rows.reduce((s, r) => s + (r.impressions ?? 0), 0),
    rows,
  };
}

function buildSeries(params: {
  periodStart: string;
  periodEnd: string;
  ads: Awaited<ReturnType<typeof sumAdMetrics>>;
  seo: Awaited<ReturnType<typeof sumSeo>>;
  email: Awaited<ReturnType<typeof sumEmailEvents>>;
  content: Awaited<ReturnType<typeof sumContentMetrics>>;
}): ReportChartPoint[] {
  const map = new Map<string, ReportChartPoint>();
  const start = new Date(`${params.periodStart}T12:00:00Z`);
  const end = new Date(`${params.periodEnd}T12:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    map.set(key, { date: key });
  }

  for (const r of params.ads.rows) {
    const p = map.get(r.metric_date) ?? { date: r.metric_date };
    p.spend_pence = (p.spend_pence ?? 0) + (r.spend_pence ?? 0);
    p.revenue_pence = (p.revenue_pence ?? 0) + (r.revenue_pence ?? 0);
    map.set(r.metric_date, p);
  }
  for (const r of params.seo.rows) {
    const p = map.get(r.metric_date) ?? { date: r.metric_date };
    p.seo_clicks = (p.seo_clicks ?? 0) + (r.clicks ?? 0);
    map.set(r.metric_date, p);
  }
  for (const r of params.email.rows) {
    const day = r.occurred_at.slice(0, 10);
    if (r.event_type === "opened") {
      const p = map.get(day) ?? { date: day };
      p.email_opens = (p.email_opens ?? 0) + 1;
      map.set(day, p);
    }
  }
  for (const r of params.content.rows) {
    const day = String(r.captured_at).slice(0, 10);
    const eng =
      (r.likes ?? 0) + (r.comments ?? 0) + (r.shares ?? 0) + (r.saves ?? 0);
    const p = map.get(day) ?? { date: day };
    p.content_engagements = (p.content_engagements ?? 0) + eng;
    map.set(day, p);
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function resolveKpiActuals(
  kpis: BrandKpi[],
  current: {
    ads: Awaited<ReturnType<typeof sumAdMetrics>>;
    content: Awaited<ReturnType<typeof sumContentMetrics>>;
    email: Awaited<ReturnType<typeof sumEmailEvents>>;
    seo: Awaited<ReturnType<typeof sumSeo>>;
    crm_revenue_pence: number;
  },
) {
  return kpis.map((kpi) => {
    let value = 0;
    switch (kpi.metric_key) {
      case "ad_spend":
        value = current.ads.spend_pence / 100;
        break;
      case "crm_revenue": {
        value = current.crm_revenue_pence / 100;
        if (value === 0) value = current.ads.revenue_pence / 100;
        break;
      }
      case "ad_revenue":
        value = current.ads.revenue_pence / 100;
        break;
      case "roas":
        value = current.ads.roas;
        break;
      case "email_opens":
        value = current.email.opens;
        break;
      case "seo_clicks":
        value = current.seo.clicks;
        break;
      case "content_engagements":
        value = current.content.engagements;
        break;
      default:
        value = 0;
    }
    return {
      ...kpi,
      actual: value,
      vs_target_pct:
        kpi.target_value === 0
          ? null
          : Math.round((value / Number(kpi.target_value)) * 1000) / 10,
    };
  });
}

export type ReportMetricsBundle = {
  organizationId: string;
  brandId: string;
  brandName: string;
  brandMarkdown: string;
  type: ReportType;
  period: PeriodBounds;
  kpis: ReturnType<typeof resolveKpiActuals>;
  current: {
    ads: Awaited<ReturnType<typeof sumAdMetrics>>;
    content: Awaited<ReturnType<typeof sumContentMetrics>>;
    email: Awaited<ReturnType<typeof sumEmailEvents>>;
    seo: Awaited<ReturnType<typeof sumSeo>>;
    crm_revenue_pence: number;
  };
  previous: {
    ads: Awaited<ReturnType<typeof sumAdMetrics>>;
    content: Awaited<ReturnType<typeof sumContentMetrics>>;
    email: Awaited<ReturnType<typeof sumEmailEvents>>;
    seo: Awaited<ReturnType<typeof sumSeo>>;
    crm_revenue_pence: number;
  };
  campaigns: Array<{
    name: string;
    status: string;
    budget_pence: number;
    spent_pence: number;
    kpi: Array<{ metric: string; target: number; current?: number; unit?: string }>;
  }>;
  plans: Array<{
    title: string;
    period_type: string;
    period_start: string;
    period_end: string;
    document: unknown;
  }>;
  series: ReportChartPoint[];
  markdown: string;
};

export async function gatherReportMetrics(params: {
  organizationId: string;
  brandId: string;
  type: ReportType;
  period: PeriodBounds;
}): Promise<ReportMetricsBundle> {
  const brandCtx = await getBrandContext(params.organizationId, params.brandId, {
    admin: true,
  });
  const kpis = await listBrandKpis(params.brandId);
  const { periodStart, periodEnd, previousStart, previousEnd } = params.period;

  const [
    adsCur,
    adsPrev,
    contentCur,
    contentPrev,
    emailCur,
    emailPrev,
    seoCur,
    seoPrev,
  ] = await Promise.all([
    sumAdMetrics(params.organizationId, periodStart, periodEnd),
    sumAdMetrics(params.organizationId, previousStart, previousEnd),
    sumContentMetrics(params.organizationId, params.brandId, periodStart, periodEnd),
    sumContentMetrics(
      params.organizationId,
      params.brandId,
      previousStart,
      previousEnd,
    ),
    sumEmailEvents(params.organizationId, periodStart, periodEnd),
    sumEmailEvents(params.organizationId, previousStart, previousEnd),
    sumSeo(params.organizationId, params.brandId, periodStart, periodEnd),
    sumSeo(params.organizationId, params.brandId, previousStart, previousEnd),
  ]);

  const supabase = createAdminClient();
  const { sumCrmRevenuePence } = await import("@/lib/crm/funnel");
  const [crmCur, crmPrev, { data: campaigns }, { data: plans }] =
    await Promise.all([
      sumCrmRevenuePence({
        organizationId: params.organizationId,
        brandId: params.brandId,
        fromDate: periodStart,
        toDate: periodEnd,
      }),
      sumCrmRevenuePence({
        organizationId: params.organizationId,
        brandId: params.brandId,
        fromDate: previousStart,
        toDate: previousEnd,
      }),
      supabase
        .from("campaigns")
        .select("name, status, budget_pence, spent_pence, kpi")
        .eq("organization_id", params.organizationId)
        .eq("brand_id", params.brandId)
        .in("status", ["active", "planned", "paused", "completed"])
        .limit(25),
      supabase
        .from("marketing_plans")
        .select("title, period_type, period_start, period_end, document, status")
        .eq("organization_id", params.organizationId)
        .eq("brand_id", params.brandId)
        .in("status", ["approved", "active", "partially_approved"])
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const current = {
    ads: adsCur,
    content: contentCur,
    email: emailCur,
    seo: seoCur,
    crm_revenue_pence: crmCur,
  };
  const previous = {
    ads: adsPrev,
    content: contentPrev,
    email: emailPrev,
    seo: seoPrev,
    crm_revenue_pence: crmPrev,
  };

  const resolvedKpis = resolveKpiActuals(kpis, current);
  const series = buildSeries({
    periodStart,
    periodEnd,
    ads: adsCur,
    seo: seoCur,
    email: emailCur,
    content: contentCur,
  });

  const markdown = `
## Period ${periodStart} → ${periodEnd} (vs ${previousStart} → ${previousEnd})

### Ads
- Spend: £${(adsCur.spend_pence / 100).toFixed(2)} (prev £${(adsPrev.spend_pence / 100).toFixed(2)}, Δ ${deltaPct(adsCur.spend_pence, adsPrev.spend_pence)}%)
- Revenue: £${(adsCur.revenue_pence / 100).toFixed(2)} (prev £${(adsPrev.revenue_pence / 100).toFixed(2)}, Δ ${deltaPct(adsCur.revenue_pence, adsPrev.revenue_pence)}%)
- ROAS: ${adsCur.roas.toFixed(2)}x (prev ${adsPrev.roas.toFixed(2)}x)
- Clicks: ${adsCur.clicks}, Conversions: ${adsCur.conversions}

### Content
- Published: ${contentCur.published} (prev ${contentPrev.published})
- Engagements: ${contentCur.engagements} (prev ${contentPrev.engagements}, Δ ${deltaPct(contentCur.engagements, contentPrev.engagements)}%)
- Impressions: ${contentCur.impressions}

### Email events
- Opens: ${emailCur.opens} (prev ${emailPrev.opens}, Δ ${deltaPct(emailCur.opens, emailPrev.opens)}%)
- Clicks: ${emailCur.clicks}, Sent/delivered: ${emailCur.sent}

### SEO (GSC)
- Clicks: ${seoCur.clicks} (prev ${seoPrev.clicks}, Δ ${deltaPct(seoCur.clicks, seoPrev.clicks)}%)
- Impressions: ${seoCur.impressions}

### CRM revenue (orders)
- £${(crmCur / 100).toFixed(2)} (prev £${(crmPrev / 100).toFixed(2)}, Δ ${deltaPct(crmCur, crmPrev)}%)

### Brand north-star KPIs (targets)
${
  resolvedKpis.length
    ? resolvedKpis
        .map(
          (k) =>
            `- ${k.is_north_star ? "★ " : ""}${k.label} (${k.metric_key}): actual ${k.actual} / target ${k.target_value} ${k.unit} (${k.vs_target_pct ?? "n/a"}% of target)`,
        )
        .join("\n")
    : "- No KPIs configured — commentary should note that targets are missing"
}

### Campaigns
${
  (campaigns ?? []).length
    ? (campaigns ?? [])
        .map(
          (c) =>
            `- ${c.name} [${c.status}] budget £${((c.budget_pence ?? 0) / 100).toFixed(0)} spent £${((c.spent_pence ?? 0) / 100).toFixed(0)} KPIs=${JSON.stringify(c.kpi ?? [])}`,
        )
        .join("\n")
    : "- None"
}

### Plans
${
  (plans ?? []).length
    ? (plans ?? [])
        .map(
          (p) =>
            `- ${p.title} (${p.period_type} ${p.period_start}→${p.period_end}) status=${p.status}`,
        )
        .join("\n")
    : "- None"
}
`.trim();

  return {
    organizationId: params.organizationId,
    brandId: params.brandId,
    brandName: brandCtx.brand.name,
    brandMarkdown: brandCtx.markdown,
    type: params.type,
    period: params.period,
    kpis: resolvedKpis,
    current,
    previous,
    campaigns: (campaigns ?? []).map((c) => ({
      name: c.name,
      status: c.status,
      budget_pence: c.budget_pence ?? 0,
      spent_pence: c.spent_pence ?? 0,
      kpi: (c.kpi ?? []) as Array<{
        metric: string;
        target: number;
        current?: number;
        unit?: string;
      }>,
    })),
    plans: (plans ?? []).map((p) => ({
      title: p.title,
      period_type: p.period_type,
      period_start: p.period_start,
      period_end: p.period_end,
      document: p.document,
    })),
    series,
    markdown,
  };
}
