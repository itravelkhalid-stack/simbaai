import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ANALYTICS_CHANNEL_LABELS,
  type AnalyticsChannel,
  type AnalyticsChartSpec,
} from "@/lib/types/analytics";

/**
 * Whitelisted, org-scoped analytics queries.
 * Claude may only pick a query_id + params — never invent SQL.
 * organization_id is always injected server-side.
 */

export const QUERY_IDS = [
  "channel_roas",
  "channel_engagement",
  "daily_trend",
  "funnel_totals",
  "spend_vs_revenue",
  "top_channels_by_metric",
  "compare_periods_channel",
] as const;

export type QueryId = (typeof QUERY_IDS)[number];

export const queryPlanSchema = z.object({
  query_id: z.enum(QUERY_IDS),
  params: z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      compare_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      compare_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      channel: z
        .enum([
          "meta",
          "tiktok",
          "google",
          "x",
          "bing",
          "email",
          "seo",
          "content",
          "social",
          "web",
          "crm",
          "other",
        ])
        .optional(),
      metric: z
        .enum([
          "impressions",
          "engagements",
          "clicks",
          "sessions",
          "leads",
          "sales",
          "revenue_pence",
          "spend_pence",
          "roas",
        ])
        .optional(),
      limit: z.number().int().min(1).max(20).optional(),
    })
    .default({}),
  answer_hint: z.string().max(500).optional(),
});

export type QueryPlan = z.infer<typeof queryPlanSchema>;

export type QueryLayerResult = {
  rows: Array<Record<string, string | number | null>>;
  chart: AnalyticsChartSpec;
  summary: string;
};

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function loadDaily(params: {
  organizationId: string;
  brandId: string;
  from: string;
  to: string;
  channel?: AnalyticsChannel;
}) {
  const supabase = createAdminClient();
  let q = supabase
    .from("analytics_daily")
    .select(
      "metric_date, channel, impressions, engagements, clicks, sessions, leads, sales, revenue_pence, spend_pence",
    )
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .gte("metric_date", params.from)
    .lte("metric_date", params.to);
  if (params.channel) q = q.eq("channel", params.channel);
  const { data, error } = await q.limit(5000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

function roas(revenue: number, spend: number) {
  if (!spend) return null;
  return Math.round((revenue / spend) * 100) / 100;
}

export async function executeWhitelistedQuery(params: {
  organizationId: string;
  brandId: string;
  plan: QueryPlan;
}): Promise<QueryLayerResult> {
  const range = defaultRange();
  const from = params.plan.params.from ?? range.from;
  const to = params.plan.params.to ?? range.to;
  const channel = params.plan.params.channel as AnalyticsChannel | undefined;
  const limit = params.plan.params.limit ?? 10;

  const rows = await loadDaily({
    organizationId: params.organizationId,
    brandId: params.brandId,
    from,
    to,
    channel,
  });

  switch (params.plan.query_id) {
    case "channel_roas": {
      const byChannel = new Map<
        string,
        { channel: string; spend_pence: number; revenue_pence: number; roas: number | null }
      >();
      for (const r of rows) {
        if (r.channel === "all") continue;
        let row = byChannel.get(r.channel);
        if (!row) {
          row = {
            channel: ANALYTICS_CHANNEL_LABELS[r.channel as AnalyticsChannel] ?? r.channel,
            spend_pence: 0,
            revenue_pence: 0,
            roas: null,
          };
          byChannel.set(r.channel, row);
        }
        row.spend_pence += r.spend_pence;
        row.revenue_pence += r.revenue_pence;
      }
      const out = [...byChannel.values()]
        .map((r) => ({
          ...r,
          roas: roas(r.revenue_pence, r.spend_pence),
        }))
        .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))
        .slice(0, limit);

      const best = out[0];
      return {
        rows: out,
        chart: {
          type: "bar",
          title: `Channel ROAS (${from} → ${to})`,
          xKey: "channel",
          series: [{ key: "roas", label: "ROAS" }],
          data: out.map((r) => ({
            channel: r.channel,
            roas: r.roas ?? 0,
          })),
        },
        summary: best
          ? `Best ROAS: ${best.channel} at ${best.roas ?? "n/a"}x (spend £${(best.spend_pence / 100).toFixed(0)}, revenue £${(best.revenue_pence / 100).toFixed(0)}).`
          : "No channel spend/revenue in range.",
      };
    }

    case "channel_engagement": {
      const byChannel = new Map<
        string,
        { channel: string; engagements: number; impressions: number }
      >();
      for (const r of rows) {
        if (r.channel === "all") continue;
        let row = byChannel.get(r.channel);
        if (!row) {
          row = {
            channel:
              ANALYTICS_CHANNEL_LABELS[r.channel as AnalyticsChannel] ?? r.channel,
            engagements: 0,
            impressions: 0,
          };
          byChannel.set(r.channel, row);
        }
        row.engagements += r.engagements;
        row.impressions += r.impressions;
      }
      const out = [...byChannel.values()]
        .sort((a, b) => b.engagements - a.engagements)
        .slice(0, limit);
      return {
        rows: out,
        chart: {
          type: "bar",
          title: `Engagements by channel (${from} → ${to})`,
          xKey: "channel",
          series: [{ key: "engagements", label: "Engagements" }],
          data: out,
        },
        summary: out[0]
          ? `Highest engagements: ${out[0].channel} (${out[0].engagements.toLocaleString()}).`
          : "No engagement data in range.",
      };
    }

    case "daily_trend": {
      const metric = params.plan.params.metric ?? "sessions";
      const byDate = new Map<string, number>();
      for (const r of rows) {
        const val =
          metric === "roas"
            ? 0
            : Number(r[metric as keyof typeof r] ?? 0);
        byDate.set(r.metric_date, (byDate.get(r.metric_date) ?? 0) + val);
      }
      if (metric === "roas") {
        const spend = new Map<string, number>();
        const rev = new Map<string, number>();
        for (const r of rows) {
          spend.set(r.metric_date, (spend.get(r.metric_date) ?? 0) + r.spend_pence);
          rev.set(r.metric_date, (rev.get(r.metric_date) ?? 0) + r.revenue_pence);
        }
        for (const date of new Set([...spend.keys(), ...rev.keys()])) {
          byDate.set(date, roas(rev.get(date) ?? 0, spend.get(date) ?? 0) ?? 0);
        }
      }
      const out = [...byDate.entries()]
        .map(([date, value]) => ({ date, value }))
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        rows: out,
        chart: {
          type: "line",
          title: `Daily ${metric} (${from} → ${to})`,
          xKey: "date",
          series: [{ key: "value", label: metric }],
          data: out,
        },
        summary: `Trend for ${metric} over ${out.length} days.`,
      };
    }

    case "funnel_totals": {
      const totals = {
        impressions: 0,
        clicks: 0,
        leads: 0,
        sales: 0,
      };
      for (const r of rows) {
        totals.impressions += r.impressions;
        totals.clicks += r.clicks;
        totals.leads += r.leads;
        totals.sales += r.sales;
      }
      const out = [
        { stage: "Impressions", value: totals.impressions },
        { stage: "Clicks", value: totals.clicks },
        { stage: "Leads", value: totals.leads },
        { stage: "Sales", value: totals.sales },
      ];
      return {
        rows: out,
        chart: {
          type: "bar",
          title: `Funnel (${from} → ${to})`,
          xKey: "stage",
          series: [{ key: "value", label: "Count" }],
          data: out,
        },
        summary: `Funnel: ${totals.impressions.toLocaleString()} → ${totals.clicks.toLocaleString()} → ${totals.leads.toLocaleString()} → ${totals.sales.toLocaleString()}.`,
      };
    }

    case "spend_vs_revenue": {
      const byDate = new Map<
        string,
        { date: string; spend: number; revenue: number }
      >();
      for (const r of rows) {
        let row = byDate.get(r.metric_date);
        if (!row) {
          row = { date: r.metric_date, spend: 0, revenue: 0 };
          byDate.set(r.metric_date, row);
        }
        row.spend += r.spend_pence / 100;
        row.revenue += r.revenue_pence / 100;
      }
      const out = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      const spend = out.reduce((a, r) => a + r.spend, 0);
      const revenue = out.reduce((a, r) => a + r.revenue, 0);
      return {
        rows: out.map((r) => ({
          date: r.date,
          spend_gbp: Math.round(r.spend),
          revenue_gbp: Math.round(r.revenue),
        })),
        chart: {
          type: "area",
          title: `Spend vs revenue (£) (${from} → ${to})`,
          xKey: "date",
          series: [
            { key: "spend", label: "Spend £" },
            { key: "revenue", label: "Revenue £" },
          ],
          data: out.map((r) => ({
            date: r.date,
            spend: Math.round(r.spend),
            revenue: Math.round(r.revenue),
          })),
        },
        summary: `Spend £${spend.toFixed(0)} vs revenue £${revenue.toFixed(0)} (ROAS ${roas(revenue * 100, spend * 100) ?? "n/a"}x).`,
      };
    }

    case "top_channels_by_metric": {
      const metric = params.plan.params.metric ?? "clicks";
      const byChannel = new Map<string, number>();
      for (const r of rows) {
        if (r.channel === "all") continue;
        const label =
          ANALYTICS_CHANNEL_LABELS[r.channel as AnalyticsChannel] ?? r.channel;
        const val =
          metric === "roas"
            ? 0
            : Number(r[metric as keyof typeof r] ?? 0);
        byChannel.set(label, (byChannel.get(label) ?? 0) + val);
      }
      if (metric === "roas") {
        const spend = new Map<string, number>();
        const rev = new Map<string, number>();
        for (const r of rows) {
          if (r.channel === "all") continue;
          const label =
            ANALYTICS_CHANNEL_LABELS[r.channel as AnalyticsChannel] ?? r.channel;
          spend.set(label, (spend.get(label) ?? 0) + r.spend_pence);
          rev.set(label, (rev.get(label) ?? 0) + r.revenue_pence);
        }
        for (const label of spend.keys()) {
          byChannel.set(label, roas(rev.get(label) ?? 0, spend.get(label) ?? 0) ?? 0);
        }
      }
      const out = [...byChannel.entries()]
        .map(([channel, value]) => ({ channel, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
      return {
        rows: out,
        chart: {
          type: "bar",
          title: `Top channels by ${metric}`,
          xKey: "channel",
          series: [{ key: "value", label: metric }],
          data: out,
        },
        summary: out[0]
          ? `Top ${metric}: ${out[0].channel} (${out[0].value.toLocaleString()}).`
          : "No data.",
      };
    }

    case "compare_periods_channel": {
      const compareFrom = params.plan.params.compare_from;
      const compareTo = params.plan.params.compare_to;
      if (!compareFrom || !compareTo) {
        return {
          rows: [],
          chart: {
            type: "bar",
            title: "Compare periods",
            xKey: "period",
            series: [{ key: "value", label: "Value" }],
            data: [],
          },
          summary: "Need compare_from and compare_to dates.",
        };
      }
      const metric = params.plan.params.metric ?? "engagements";
      const prior = await loadDaily({
        organizationId: params.organizationId,
        brandId: params.brandId,
        from: compareFrom,
        to: compareTo,
        channel,
      });
      const sumMetric = (
        list: typeof rows,
        m: string,
      ) => {
        if (m === "roas") {
          const spend = list.reduce((a, r) => a + r.spend_pence, 0);
          const rev = list.reduce((a, r) => a + r.revenue_pence, 0);
          return roas(rev, spend) ?? 0;
        }
        return list.reduce(
          (a, r) => a + Number(r[m as keyof typeof r] ?? 0),
          0,
        );
      };
      const currentVal = sumMetric(rows, metric);
      const priorVal = sumMetric(prior, metric);
      const out = [
        { period: "Prior", value: priorVal },
        { period: "Current", value: currentVal },
      ];
      const delta =
        priorVal === 0
          ? currentVal
            ? 100
            : 0
          : Math.round(((currentVal - priorVal) / priorVal) * 1000) / 10;
      const label = channel
        ? ANALYTICS_CHANNEL_LABELS[channel]
        : "All channels";
      return {
        rows: out,
        chart: {
          type: "bar",
          title: `${label} ${metric}: current vs prior`,
          xKey: "period",
          series: [{ key: "value", label: metric }],
          data: out,
        },
        summary: `${label} ${metric}: ${currentVal.toLocaleString()} vs ${priorVal.toLocaleString()} (${delta > 0 ? "+" : ""}${delta}%).`,
      };
    }

    default:
      throw new Error("Unknown query_id");
  }
}

export const QUERY_CATALOG_FOR_PROMPT = QUERY_IDS.map((id) => {
  const descriptions: Record<QueryId, string> = {
    channel_roas: "ROAS by channel for a date range",
    channel_engagement: "Engagements by channel",
    daily_trend: "Daily time series for a metric",
    funnel_totals: "Impressions → clicks → leads → sales funnel",
    spend_vs_revenue: "Daily spend vs revenue",
    top_channels_by_metric: "Rank channels by a metric",
    compare_periods_channel: "Compare a metric current vs prior period (optionally one channel)",
  };
  return `- ${id}: ${descriptions[id]}`;
}).join("\n");
