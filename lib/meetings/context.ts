import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandContext } from "@/lib/brand/context";
import type { MeetingType } from "@/lib/types/meetings";

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
};

function periodForType(type: MeetingType): { from: Date; to: Date; label: string } {
  const to = new Date();
  if (type === "daily_standup") {
    const from = daysAgo(1);
    return { from, to: daysAgo(0), label: "Yesterday → today" };
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

  const [
    { data: publishedPosts },
    { data: contentMetrics },
    { data: adMetrics },
    { data: emailCampaigns },
    { data: gscDaily },
    { data: seoKeywords },
    { data: seoSummaries },
    { data: tasks },
    { data: plans },
    { data: campaigns },
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
      .from("content_metrics")
      .select(
        "content_item_id, impressions, reach, likes, comments, shares, clicks, captured_at",
      )
      .eq("organization_id", params.organizationId)
      .gte("captured_at", from.toISOString())
      .lte("captured_at", to.toISOString())
      .limit(200),
    supabase
      .from("ad_metrics_daily")
      .select(
        "metric_date, spend_pence, impressions, clicks, conversions, revenue_pence",
      )
      .eq("organization_id", params.organizationId)
      .gte("metric_date", fromDate)
      .lte("metric_date", toDate),
    supabase
      .from("email_campaigns")
      .select("id, name, status, stats, sent_at, created_at")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .order("created_at", { ascending: false })
      .limit(20),
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
  ]);

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

  const completedTasks = (tasks ?? []).filter((t) => t.status === "done");
  const blockedTasks = (tasks ?? []).filter((t) => t.status === "blocked");
  const inProgressTasks = (tasks ?? []).filter((t) => t.status === "in_progress");

  const planKpis =
    (plans?.[0]?.document as { kpi_targets?: Array<{ metric: string; target: number; current?: number }> } | null)
      ?.kpi_targets ?? [];

  const snapshot = {
    period: { fromDate, toDate, label, yesterday, today },
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
    },
    seo: {
      clicks: gscClicks,
      impressions: gscImpressions,
      keywords: seoKeywords ?? [],
      weekly_summaries: seoSummaries ?? [],
      daily: gscDaily ?? [],
    },
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

  const markdown = `
## Period: ${label} (${fromDate} → ${toDate})

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

### Early content metrics (sample)
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

### Paid ads
- Spend: £${(adSpend / 100).toFixed(2)} (${adSpend} pence)
- Attributed revenue: £${(adRevenue / 100).toFixed(2)}
- ROAS: ${roas.toFixed(2)}x
- Clicks: ${adClicks}, Conversions: ${adConversions}

### Email
- Campaigns sent/sending in window: ${emailSends.length}
- Opens (sum of stats): ${emailOpens}
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

### Planning tasks
- Completed: ${completedTasks.length}
- Blocked: ${blockedTasks.length}
- In progress: ${inProgressTasks.length}
${
  blockedTasks.length
    ? `Blocked:\n${blockedTasks.map((t) => `- ${t.title} (${t.module})`).join("\n")}`
    : ""
}
${
  inProgressTasks.length
    ? `In progress:\n${inProgressTasks
        .slice(0, 10)
        .map((t) => `- ${t.title} (${t.module})`)
        .join("\n")}`
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
  };
}
