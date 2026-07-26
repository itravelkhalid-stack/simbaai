import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandContext } from "@/lib/brand/context";
import type { MeetingType } from "@/lib/types/meetings";
import type { BrandKpi } from "@/lib/types/reviews";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export type MeetingPeriodContext = {
  organizationId: string;
  brandId: string;
  brandName: string;
  brandMarkdown: string;
  periodLabel: string;
  fromDate: string;
  toDate: string;
  markdown: string;
  snapshot: Record<string, unknown>;
  emptySources: string[];
  dataSparse: boolean;
};

function periodForType(type: MeetingType): { from: Date; to: Date; label: string } {
  const to = new Date();
  if (type === "daily_standup") {
    return { from: daysAgo(1), to: daysAgo(0), label: "Yesterday → today" };
  }
  if (type === "weekly_marketing") {
    return { from: daysAgo(7), to, label: "Last 7 days" };
  }
  if (type === "monthly_board") {
    return { from: daysAgo(30), to, label: "Last 30 days" };
  }
  if (type === "quarterly_board") {
    return { from: daysAgo(90), to, label: "Last 90 days" };
  }
  if (type === "annual_review") {
    return { from: daysAgo(365), to, label: "Last 12 months" };
  }
  return { from: daysAgo(14), to, label: "Last 14 days" };
}

export async function gatherMeetingContext(params: {
  organizationId: string;
  brandId: string;
  type: MeetingType;
}): Promise<MeetingPeriodContext> {
  const supabase = createAdminClient();
  const brandCtx = await getBrandContext(params.organizationId, params.brandId, {
    admin: true,
  });
  const { from, to, label } = periodForType(params.type);
  const fromDate = isoDate(from);
  const toDate = isoDate(to);
  const yesterday = isoDate(daysAgo(1));
  const today = isoDate(new Date());

  const { data: seoProjects } = await supabase
    .from("seo_projects")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId);
  const seoProjectIds = (seoProjects ?? []).map((p) => p.id);

  const { data: brandCampaigns } = await supabase
    .from("ad_campaigns")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId);
  const campaignIds = (brandCampaigns ?? []).map((c) => c.id);

  const [
    { data: publishedPosts },
    { data: emailCampaigns },
    { data: emailEvents },
    { data: gscDaily },
    { data: seoKeywords },
    { data: seoSummaries },
    { data: tasks },
    { data: plans },
    { data: campaigns },
    { data: brandKpis },
    { data: ga4Daily },
    { data: financeSummaries },
  ] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, title, platform, status, published_at")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("status", "published")
      .gte("published_at", from.toISOString())
      .lte("published_at", to.toISOString())
      .order("published_at", { ascending: false })
      .limit(40),
    supabase
      .from("email_campaigns")
      .select("id, name, status, stats, sent_at, created_at")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("email_events")
      .select("event_type, occurred_at")
      .eq("organization_id", params.organizationId)
      .gte("occurred_at", from.toISOString())
      .lte("occurred_at", to.toISOString())
      .limit(500),
    seoProjectIds.length
      ? supabase
          .from("seo_gsc_daily")
          .select("metric_date, clicks, impressions, ctr, position")
          .eq("organization_id", params.organizationId)
          .in("project_id", seoProjectIds)
          .gte("metric_date", fromDate)
          .lte("metric_date", toDate)
      : Promise.resolve({ data: [] as never[] }),
    seoProjectIds.length
      ? supabase
          .from("seo_keywords")
          .select("keyword, current_position, previous_position, volume, intent")
          .eq("organization_id", params.organizationId)
          .in("project_id", seoProjectIds)
          .order("updated_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [] as never[] }),
    seoProjectIds.length
      ? supabase
          .from("seo_weekly_summaries")
          .select("week_start, summary_markdown, highlights")
          .eq("organization_id", params.organizationId)
          .in("project_id", seoProjectIds)
          .order("week_start", { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("campaign_tasks")
      .select(
        "id, title, status, module, assignee_type, due_date, completed_at, campaigns!inner(brand_id)",
      )
      .eq("organization_id", params.organizationId)
      .eq("campaigns.brand_id", params.brandId)
      .or(
        `and(completed_at.gte.${from.toISOString()},completed_at.lte.${to.toISOString()}),status.eq.blocked,status.eq.in_progress`,
      )
      .limit(80),
    supabase
      .from("marketing_plans")
      .select(
        "id, title, status, period_type, period_start, period_end, document, budget_pence, currency",
      )
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .in("status", ["approved", "active", "partially_approved"])
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("campaigns")
      .select(
        "id, name, status, budget_pence, spent_pence, kpi, channels, start_date, end_date",
      )
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .in("status", ["active", "planned", "paused"])
      .limit(20),
    supabase
      .from("brand_kpis")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("analytics_ga4_daily")
      .select("metric_date, sessions, conversions")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("metric_date", fromDate)
      .lte("metric_date", toDate)
      .limit(400),
    supabase
      .from("finance_weekly_summaries")
      .select("week_start, summary_markdown, alerts")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("week_start", fromDate)
      .order("week_start", { ascending: false })
      .limit(8),
  ]);

  const postIds = (publishedPosts ?? []).map((p) => p.id);
  const { data: contentMetrics } = postIds.length
    ? await supabase
        .from("content_metrics")
        .select(
          "content_item_id, impressions, reach, likes, comments, shares, clicks, captured_at",
        )
        .eq("organization_id", params.organizationId)
        .in("content_item_id", postIds)
        .gte("captured_at", from.toISOString())
        .lte("captured_at", to.toISOString())
        .limit(200)
    : { data: [] as never[] };

  const { data: adMetrics } = campaignIds.length
    ? await supabase
        .from("ad_metrics_daily")
        .select(
          "campaign_id, metric_date, spend_pence, impressions, clicks, conversions, revenue_pence",
        )
        .eq("organization_id", params.organizationId)
        .in("campaign_id", campaignIds)
        .gte("metric_date", fromDate)
        .lte("metric_date", toDate)
    : { data: [] as never[] };

  const adSpend = (adMetrics ?? []).reduce((s, r) => s + (r.spend_pence ?? 0), 0);
  const adRevenue = (adMetrics ?? []).reduce((s, r) => s + (r.revenue_pence ?? 0), 0);
  const adClicks = (adMetrics ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
  const adConversions = (adMetrics ?? []).reduce(
    (s, r) => s + Number(r.conversions ?? 0),
    0,
  );
  const roas = adSpend > 0 ? adRevenue / adSpend : 0;

  const gscClicks = (gscDaily ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
  const gscImpressions = (gscDaily ?? []).reduce(
    (s, r) => s + (r.impressions ?? 0),
    0,
  );

  const emailSends = (emailCampaigns ?? []).filter(
    (c) => c.status === "sent" || c.status === "sending",
  );
  const emailOpens = emailSends.reduce(
    (s, c) => s + Number((c.stats as Record<string, number>)?.opens ?? 0),
    0,
  );
  const emailEventCounts = (emailEvents ?? []).reduce(
    (acc, e) => {
      const key = String(e.event_type ?? "unknown");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const ga4Sessions = (ga4Daily ?? []).reduce((s, r) => s + Number(r.sessions ?? 0), 0);
  const ga4Conversions = (ga4Daily ?? []).reduce(
    (s, r) => s + Number(r.conversions ?? 0),
    0,
  );

  const completedTasks = (tasks ?? []).filter((t) => t.status === "done");
  const blockedTasks = (tasks ?? []).filter((t) => t.status === "blocked");
  const inProgressTasks = (tasks ?? []).filter((t) => t.status === "in_progress");

  const planKpis =
    (plans?.[0]?.document as { kpi_targets?: Array<{ metric: string; target: number; current?: number }> } | null)
      ?.kpi_targets ?? [];

  const kpis = (brandKpis ?? []) as BrandKpi[];
  const kpiActuals: Record<string, number> = {
    ad_spend: adSpend / 100,
    ad_revenue: adRevenue / 100,
    roas,
    email_opens: emailOpens,
    seo_clicks: gscClicks,
    content_engagements: (contentMetrics ?? []).reduce(
      (s, m) => s + (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0),
      0,
    ),
  };

  const emptySources: string[] = [];
  if (!(publishedPosts ?? []).length) emptySources.push("content_items");
  if (!(contentMetrics ?? []).length) emptySources.push("content_metrics");
  if (!(adMetrics ?? []).length) emptySources.push("ad_metrics_daily");
  if (!emailSends.length && !(emailEvents ?? []).length) emptySources.push("email");
  if (!(gscDaily ?? []).length) emptySources.push("gsc");
  if (!(ga4Daily ?? []).length) emptySources.push("ga4");
  if (!(financeSummaries ?? []).length) emptySources.push("finance");
  if (!kpis.length && !planKpis.length) emptySources.push("kpi_targets");
  if (!(plans ?? []).length) emptySources.push("marketing_plan");

  const dataSparse = emptySources.length >= 4;

  const snapshot = {
    period: { fromDate, toDate, label, yesterday, today },
    empty_sources: emptySources,
    data_sparse: dataSparse,
    content: {
      published_count: (publishedPosts ?? []).length,
      posts: (publishedPosts ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        platform: p.platform,
        published_at: p.published_at,
      })),
      early_metrics: (contentMetrics ?? []).slice(0, 40),
    },
    ads: {
      spend_pence: adSpend,
      revenue_pence: adRevenue,
      clicks: adClicks,
      conversions: adConversions,
      roas,
      daily: adMetrics ?? [],
    },
    email: {
      sends: emailSends.map((c) => ({
        id: c.id,
        name: c.name,
        stats: c.stats,
        sent_at: c.sent_at,
      })),
      opens: emailOpens,
      events: emailEventCounts,
    },
    seo: {
      clicks: gscClicks,
      impressions: gscImpressions,
      keywords: seoKeywords ?? [],
      weekly_summaries: seoSummaries ?? [],
      daily: gscDaily ?? [],
    },
    ga4: {
      sessions: ga4Sessions,
      conversions: ga4Conversions,
      days: (ga4Daily ?? []).length,
    },
    finance: {
      weekly_summaries: financeSummaries ?? [],
    },
    brand_kpis: kpis.map((k) => ({
      metric_key: k.metric_key,
      label: k.label,
      target_value: k.target_value,
      unit: k.unit,
      actual: kpiActuals[k.metric_key] ?? null,
      variance_pct:
        k.target_value > 0 && kpiActuals[k.metric_key] != null
          ? ((kpiActuals[k.metric_key]! - k.target_value) / k.target_value) * 100
          : null,
    })),
    tasks: {
      completed: completedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        module: t.module,
      })),
      blocked: blockedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        module: t.module,
      })),
      in_progress: inProgressTasks.map((t) => ({
        id: t.id,
        title: t.title,
        module: t.module,
      })),
    },
    plans: plans ?? [],
    plan_kpis: planKpis,
    campaigns: campaigns ?? [],
  };

  const emptyDisclosure = dataSparse
    ? `
## DATA AVAILABILITY WARNING
This meeting has sparse or empty live data. Missing sources: ${emptySources.join(", ") || "none"}.
You MUST state explicitly in the minutes that context is incomplete / empty for those sources. Do not invent metrics.
`
    : emptySources.length
      ? `
## Data gaps
Missing or empty sources this period: ${emptySources.join(", ")}. Mention these gaps briefly in the minutes.
`
      : "";

  const markdown = `
## Period: ${label} (${fromDate} → ${toDate})
${emptyDisclosure}

### Brand KPI targets vs actuals
${
  kpis.length
    ? kpis
        .map((k) => {
          const actual = kpiActuals[k.metric_key];
          const variance =
            k.target_value > 0 && actual != null
              ? `${(((actual - k.target_value) / k.target_value) * 100).toFixed(1)}%`
              : "n/a";
          return `- ${k.label} (${k.metric_key}): target ${k.target_value}${k.unit} | actual ${actual ?? "n/a"} | variance ${variance}`;
        })
        .join("\n")
    : "- No brand_kpis configured"
}

### Content published
- Count: ${(publishedPosts ?? []).length}
${
  (publishedPosts ?? []).length
    ? (publishedPosts ?? [])
        .slice(0, 15)
        .map(
          (p) =>
            `- ${p.title ?? "Untitled"} (${p.platform}) @ ${p.published_at ?? "n/a"}`,
        )
        .join("\n")
    : "- None"
}

### Content metrics (brand-scoped)
${
  (contentMetrics ?? []).length
    ? (contentMetrics ?? [])
        .slice(0, 10)
        .map(
          (m) =>
            `- item ${m.content_item_id}: imp ${m.impressions ?? 0}, likes ${m.likes ?? 0}, comments ${m.comments ?? 0}, clicks ${m.clicks ?? 0} (${m.captured_at})`,
        )
        .join("\n")
    : "- No metrics yet"
}

### Paid ads (brand campaigns only)
- Spend: £${(adSpend / 100).toFixed(2)} (${adSpend} pence)
- Attributed revenue: £${(adRevenue / 100).toFixed(2)}
- ROAS: ${roas.toFixed(2)}x
- Clicks: ${adClicks}, Conversions: ${adConversions}

### Email
- Campaigns sent/sending in window: ${emailSends.length}
- Opens (sum of stats): ${emailOpens}
- Event counts: ${JSON.stringify(emailEventCounts)}
${
  emailSends.length
    ? emailSends
        .slice(0, 8)
        .map((c) => `- ${c.name}: ${JSON.stringify(c.stats ?? {})}`)
        .join("\n")
    : "- No sends"
}

### SEO (GSC)
- Clicks: ${gscClicks}, Impressions: ${gscImpressions}
### Keyword positions
${
  (seoKeywords ?? []).length
    ? (seoKeywords ?? [])
        .slice(0, 12)
        .map((r) => {
          const cur = r.current_position ?? "n/a";
          const prev = r.previous_position;
          const move =
            prev != null && r.current_position != null
              ? r.current_position - prev
              : null;
          const moveLabel =
            move == null ? "" : move < 0 ? ` ↑${Math.abs(move)}` : move > 0 ? ` ↓${move}` : " →";
          return `- ${r.keyword}: pos ${cur}${moveLabel}`;
        })
        .join("\n")
    : "- None tracked"
}
### Recent SEO weekly summaries
${
  (seoSummaries ?? []).length
    ? (seoSummaries ?? [])
        .slice(0, 2)
        .map(
          (s) =>
            `- Week ${s.week_start}: ${(s.summary_markdown ?? "").slice(0, 280)}`,
        )
        .join("\n")
    : "- None"
}

### GA4
- Sessions: ${ga4Sessions}, Conversions: ${ga4Conversions}
- Days with data: ${(ga4Daily ?? []).length}

### Finance rollups
${
  (financeSummaries ?? []).length
    ? (financeSummaries ?? [])
        .slice(0, 4)
        .map(
          (s) =>
            `- Week ${s.week_start}: ${(s.summary_markdown ?? "").slice(0, 240)}`,
        )
        .join("\n")
    : "- No finance weekly summaries in window"
}

### Planning tasks
- Completed: ${completedTasks.length}
- Blocked: ${blockedTasks.length}
- In progress: ${inProgressTasks.length}
${
  blockedTasks.length
    ? `Blocked:\n${blockedTasks.map((t) => `- ${t.title} (${t.module})`).join("\n")}`
    : ""
}

### Active / planned campaigns
${
  (campaigns ?? []).length
    ? (campaigns ?? [])
        .map(
          (c) =>
            `- ${c.name} [${c.status}] budget £${((c.budget_pence ?? 0) / 100).toFixed(0)} spent £${((c.spent_pence ?? 0) / 100).toFixed(0)} | KPIs: ${JSON.stringify(c.kpi ?? [])}`,
        )
        .join("\n")
    : "- None"
}

### Plan KPI targets (latest plan)
${
  planKpis.length
    ? planKpis
        .map(
          (k) =>
            `- ${k.metric}: target ${k.target}${k.current != null ? ` current ${k.current}` : ""}`,
        )
        .join("\n")
    : "- No approved plan KPIs"
}

### Active ad campaign IDs (for typed pause/budget actions)
${
  campaignIds.length
    ? campaignIds.map((id) => `- ${id}`).join("\n")
    : "- None"
}
`.trim();

  return {
    organizationId: params.organizationId,
    brandId: params.brandId,
    brandName: brandCtx.brand.name,
    brandMarkdown: brandCtx.markdown,
    periodLabel: label,
    fromDate,
    toDate,
    markdown,
    snapshot,
    emptySources,
    dataSparse,
  };
}
