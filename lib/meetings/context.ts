import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandContext } from "@/lib/brand/context";
import {
  GA4_REVENUE_SETUP_BLOCKER,
  hasGa4RevenueTracking,
  resolveGa4IntentEvents,
  resolveGa4RevenueEvents,
} from "@/lib/data/ga4-conversion-events";
import { buildKpiActualsMap } from "@/lib/reviews/kpi-actuals";
import { latestFollowersInPeriod } from "@/lib/social/metrics";
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
  /** Sources with no connection / integration configured. */
  notConnectedSources: string[];
  /** Sources that are connected but returned zero/empty rows this period. */
  connectedEmptySources: string[];
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
    .select("id, gsc_connected, gsc_site_url")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId);
  const seoProjectIds = (seoProjects ?? []).map((p) => p.id);
  const gscConnected = (seoProjects ?? []).some(
    (p) => p.gsc_connected && Boolean(p.gsc_site_url),
  );

  const { data: ga4Connection } = await supabase
    .from("ga4_connections")
    .select(
      "id, status, property_id, conversion_event_names, intent_event_names, discovered_event_names",
    )
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .maybeSingle();
  const ga4Connected = Boolean(
    ga4Connection &&
      ga4Connection.status !== "error" &&
      ga4Connection.property_id,
  );

  const { data: brandCampaigns } = await supabase
    .from("ad_campaigns")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId);
  const campaignIds = (brandCampaigns ?? []).map((c) => c.id);

  const { getCombinedAdPotActual } = await import("@/lib/finance/metrics");
  const combinedAdPot = await getCombinedAdPotActual({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });

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
      .select("metric_date, sessions, conversions, intent_events")
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
  const ga4RevenueConversions = (ga4Daily ?? []).reduce(
    (s, r) => s + Number(r.conversions ?? 0),
    0,
  );
  const ga4IntentEvents = (ga4Daily ?? []).reduce(
    (s, r) => s + Number(r.intent_events ?? 0),
    0,
  );
  const ga4RevenueResolved = resolveGa4RevenueEvents({
    configured: ga4Connection?.conversion_event_names ?? [],
    discoveredEventNames: ga4Connection?.discovered_event_names ?? [],
  });
  const ga4IntentResolved = resolveGa4IntentEvents({
    configured: ga4Connection?.intent_event_names ?? [],
    revenueEvents: ga4RevenueResolved.events,
  });
  const ga4RevenueConfigured =
    ga4Connected &&
    hasGa4RevenueTracking({
      conversionEventNames: ga4Connection?.conversion_event_names,
      discoveredEventNames: ga4Connection?.discovered_event_names,
    });
  const setupBlockers = [
    ...(ga4Connected && !ga4RevenueConfigured
      ? [
          {
            title: GA4_REVENUE_SETUP_BLOCKER.title,
            detail: GA4_REVENUE_SETUP_BLOCKER.detail,
            needs_human: true,
            kind: "setup" as const,
          },
        ]
      : []),
  ];

  const completedTasks = (tasks ?? []).filter((t) => t.status === "done");
  const blockedTasks = (tasks ?? []).filter((t) => t.status === "blocked");
  const inProgressTasks = (tasks ?? []).filter((t) => t.status === "in_progress");

  const planKpis =
    (plans?.[0]?.document as { kpi_targets?: Array<{ metric: string; target: number; current?: number }> } | null)
      ?.kpi_targets ?? [];

  const kpis = (brandKpis ?? []) as BrandKpi[];
  const { sumCrmRevenuePence } = await import("@/lib/crm/funnel");
  const [crmRevenuePence, igFollowers, fbFollowers] = await Promise.all([
    sumCrmRevenuePence({
      organizationId: params.organizationId,
      brandId: params.brandId,
      fromDate,
      toDate,
    }),
    latestFollowersInPeriod({
      organizationId: params.organizationId,
      brandId: params.brandId,
      platform: "instagram",
      fromDate,
      toDate,
    }),
    latestFollowersInPeriod({
      organizationId: params.organizationId,
      brandId: params.brandId,
      platform: "facebook",
      fromDate,
      toDate,
    }),
  ]);

  const kpiActuals = buildKpiActualsMap({
    ad_spend_pence: adSpend,
    ad_revenue_pence: adRevenue,
    ad_conversions: adConversions,
    email_opens: emailOpens,
    seo_clicks: gscClicks,
    content_engagements: (contentMetrics ?? []).reduce(
      (s, m) => s + (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0),
      0,
    ),
    crm_revenue_pence: crmRevenuePence,
    ig_followers: igFollowers,
    fb_followers: fbFollowers,
  });
  // Avoid false "0 SEO clicks" KPI misses when Search Console isn't connected.
  if (!gscConnected) {
    delete kpiActuals.seo_clicks;
  }

  const notConnectedSources: string[] = [];
  const connectedEmptySources: string[] = [];

  // Social / content / ads / email: treat "no rows" as empty (connection is per-platform;
  // we don't always have a single connected flag). GSC/GA4 get explicit connect status.
  if (!igFollowers && !fbFollowers) connectedEmptySources.push("social_followers");
  if (!(publishedPosts ?? []).length) connectedEmptySources.push("content_items");
  if (!(contentMetrics ?? []).length) connectedEmptySources.push("content_metrics");
  if (!(adMetrics ?? []).length) connectedEmptySources.push("ad_metrics_daily");
  if (!emailSends.length && !(emailEvents ?? []).length) {
    connectedEmptySources.push("email");
  }

  if (!seoProjectIds.length || !gscConnected) {
    notConnectedSources.push("gsc");
  } else if (!(gscDaily ?? []).length) {
    connectedEmptySources.push("gsc");
  }

  if (!ga4Connected) {
    notConnectedSources.push("ga4");
  } else if (!(ga4Daily ?? []).length) {
    connectedEmptySources.push("ga4");
  }

  if (!(financeSummaries ?? []).length) connectedEmptySources.push("finance");
  if (!kpis.length && !planKpis.length) connectedEmptySources.push("kpi_targets");
  if (!(plans ?? []).length) connectedEmptySources.push("marketing_plan");

  const emptySources = [...notConnectedSources, ...connectedEmptySources];
  const dataSparse = emptySources.length >= 4;

  const gscStatus = !seoProjectIds.length
    ? "not_connected"
    : !gscConnected
      ? "not_connected"
      : (gscDaily ?? []).length
        ? "connected"
        : "connected_but_zero";
  const ga4Status = !ga4Connected
    ? "not_connected"
    : (ga4Daily ?? []).length
      ? "connected"
      : "connected_but_zero";

  const { getLatestCeoCheck } = await import("@/lib/ceo/run");
  const ceoCheck = await getLatestCeoCheck({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });

  const snapshot = {
    period: { fromDate, toDate, label, yesterday, today },
    empty_sources: emptySources,
    not_connected_sources: notConnectedSources,
    connected_empty_sources: connectedEmptySources,
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
      cpa_pounds: kpiActuals.cpa,
      daily: adMetrics ?? [],
    },
    social_followers: {
      ig_followers: igFollowers,
      fb_followers: fbFollowers,
    },
    crm_revenue_pence: crmRevenuePence,
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
      status: gscStatus,
      connected: gscConnected,
      clicks: gscStatus === "not_connected" ? null : gscClicks,
      impressions: gscStatus === "not_connected" ? null : gscImpressions,
      keywords: seoKeywords ?? [],
      weekly_summaries: seoSummaries ?? [],
      daily: gscDaily ?? [],
    },
    ga4: {
      status: ga4Status,
      connected: ga4Connected,
      sessions: ga4Status === "not_connected" ? null : ga4Sessions,
      revenue_conversions:
        ga4Status === "not_connected" ? null : ga4RevenueConversions,
      intent_events: ga4Status === "not_connected" ? null : ga4IntentEvents,
      /** @deprecated Prefer revenue_conversions — never treat intent as conversions. */
      conversions:
        ga4Status === "not_connected" ? null : ga4RevenueConversions,
      days: (ga4Daily ?? []).length,
      revenue_tracking_configured: ga4RevenueConfigured,
      revenue_events: ga4RevenueResolved.events,
      revenue_mode: ga4RevenueResolved.mode,
      intent_event_names: ga4IntentResolved.events,
      intent_mode: ga4IntentResolved.mode,
    },
    setup_blockers: setupBlockers,
    ceo: ceoCheck
      ? {
          checked_at: ceoCheck.checked_at,
          overall_status: ceoCheck.overall_status,
          accountability_markdown: ceoCheck.accountability_markdown,
          state_of_company_markdown: ceoCheck.state_of_company_markdown,
          hire_proposals: ceoCheck.hire_proposals,
          actions_taken: ceoCheck.actions_taken,
        }
      : null,
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

  const emptyDisclosure =
    notConnectedSources.length || connectedEmptySources.length
      ? `
## DATA SOURCE STATUS (read carefully)
${
  notConnectedSources.length
    ? `- NOT CONNECTED (do not treat as performance failure; do not invent zeros): ${notConnectedSources.join(", ")}`
    : "- NOT CONNECTED: none"
}
${
  connectedEmptySources.length
    ? `- CONNECTED BUT ZERO/EMPTY this period (real zeros — may indicate underperformance or no activity): ${connectedEmptySources.join(", ")}`
    : "- CONNECTED BUT ZERO/EMPTY: none"
}
${
  dataSparse
    ? "Overall context is sparse. State gaps explicitly. Never raise performance blockers for NOT CONNECTED sources."
    : "Mention gaps briefly. Never raise performance blockers for NOT CONNECTED sources."
}
`
      : "";

  const ceoSection = ceoCheck
    ? `
### CEO accountability (from latest CEO check)
${ceoCheck.accountability_markdown}
${
  params.type === "weekly_marketing" && ceoCheck.state_of_company_markdown
    ? `\n### CEO state of the company (weekly)\n${ceoCheck.state_of_company_markdown}\n`
    : ""
}
Include a dedicated "CEO accountability" section in minutes covering department status, what the CEO did, and hiring proposals. Prefer the CEO markdown above over re-deriving status.
`
    : `
### CEO accountability
- No CEO check yet for this brand. Note the gap; do not invent accountability results.
`;

  let mediaInventorySection = "";
  if (params.type === "daily_standup") {
    const { computeMediaInventoryHealth } = await import(
      "@/lib/media/inventory"
    );
    const inventory = await computeMediaInventoryHealth({
      organizationId: params.organizationId,
      brandId: params.brandId,
    });
    const asks = inventory.filter((r) => r.ask).map((r) => `- ${r.ask}`);
    mediaInventorySection = `
### Image library inventory
${inventory
  .map(
    (r) =>
      `- ${r.label}: ${r.unusedCount} unused / ${r.suitableCount} suitable${
        r.daysRemaining != null ? ` (~${r.daysRemaining} days at cadence)` : ""
      }`,
  )
  .join("\n")}
${
  asks.length
    ? `\n### Upload asks (action for the team)\n${asks.join("\n")}`
    : "\n- No urgent upload asks"
}
`;
  }

  const markdown = `
## Period: ${label} (${fromDate} → ${toDate})
${emptyDisclosure}
${ceoSection}
${mediaInventorySection}

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
- CPA: £${kpiActuals.cpa > 0 ? kpiActuals.cpa.toFixed(2) : "n/a"}
- Clicks: ${adClicks}, Conversions: ${adConversions}

### Social followers (latest snapshot in period)
- Instagram: ${igFollowers || "n/a"}
- Facebook Page: ${fbFollowers || "n/a"}

### CRM revenue (orders)
- £${(crmRevenuePence / 100).toFixed(2)} (falls back to ad revenue in KPI map when zero)

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

### SEO (GSC) — status: ${gscStatus}
${
  gscStatus === "not_connected"
    ? "- GSC is NOT CONNECTED for this brand. Do not report 0 clicks or zero organic visibility as a performance issue."
    : `- Clicks: ${gscClicks}, Impressions: ${gscImpressions}${
        gscStatus === "connected_but_zero"
          ? " (connected; zero rows this period)"
          : ""
      }`
}
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

### GA4 — status: ${ga4Status}
${
  ga4Status === "not_connected"
    ? "- GA4 is NOT CONNECTED for this brand. Do not treat missing sessions/conversions as a performance miss."
    : `- Sessions: ${ga4Sessions}
- Revenue conversions: ${ga4RevenueConversions} (events: ${ga4RevenueResolved.events.join(", ") || "none"}; mode: ${ga4RevenueResolved.mode})
- Intent / engagement proxies: ${ga4IntentEvents} (events: ${ga4IntentResolved.events.join(", ") || "none"}) — label as intent proxies, NOT conversions/sales
- Days with data: ${(ga4Daily ?? []).length}${
        ga4Status === "connected_but_zero"
          ? " (connected; zero rows this period)"
          : ""
      }
- Revenue tracking configured: ${ga4RevenueConfigured ? "yes" : "NO — standing setup blocker"}
${
  !ga4RevenueConfigured
    ? `- SETUP BLOCKER (must include in blockers with needs_human=true): ${GA4_REVENUE_SETUP_BLOCKER.title}. ${GA4_REVENUE_SETUP_BLOCKER.detail}
- Do NOT compute ROAS, CPA, or revenue attribution from intent proxy events. State that revenue tracking is not configured.`
    : "- Use revenue_conversions only for conversion/ROAS/CPA context from GA4. Intent proxies are funnel signals only."
}`
}

### Standing setup blockers (always surface in blockers when present)
${
  setupBlockers.length
    ? setupBlockers
        .map((b) => `- ${b.title}: ${b.detail}`)
        .join("\n")
    : "- None"
}

### Combined ad budget pot (ALL platforms share one monthly pot)
- Month: ${combinedAdPot.year_month} (source: ${combinedAdPot.pot_source}, mode: ${combinedAdPot.allocation_mode})
- Pot: £${((combinedAdPot.pot_pence ?? 0) / 100).toFixed(0)} · Spend MTD: £${(combinedAdPot.actual_ad_spend_pence / 100).toFixed(2)} · Projected month-end: £${(combinedAdPot.projected_month_end_pence / 100).toFixed(2)}
- Pacing: ${combinedAdPot.pacing_label}
- ${combinedAdPot.note}
- When proposing shift_budget, keep the SUM of daily budgets across Meta+Google (and future platforms) within this pot's daily pace (monthly/30 ±20%) and org_ad_limits.

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
    notConnectedSources,
    connectedEmptySources,
    dataSparse,
  };
}
