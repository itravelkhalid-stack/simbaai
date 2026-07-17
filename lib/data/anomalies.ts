import { generateAnomalyContext } from "@/lib/agents/analytics/generate";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/planning/materialize";
import type { AnalyticsChannel, AnalyticsDaily } from "@/lib/types/analytics";
import { ANALYTICS_CHANNEL_LABELS } from "@/lib/types/analytics";

type Candidate = {
  brand_id: string;
  organization_id: string;
  metric_date: string;
  channel: AnalyticsChannel;
  metric_key: string;
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  current_value: number;
  baseline_value: number;
  delta_pct: number;
};

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function pctDelta(current: number, baseline: number) {
  if (!baseline) return current ? 100 : 0;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}

function aggregate(
  rows: AnalyticsDaily[],
  channel: AnalyticsChannel | "all",
  field: keyof AnalyticsDaily,
) {
  return rows
    .filter((r) => channel === "all" || r.channel === channel)
    .reduce((acc, r) => acc + Number(r[field] ?? 0), 0);
}

function ctr(rows: AnalyticsDaily[], channel: AnalyticsChannel | "all") {
  const impressions = aggregate(rows, channel, "impressions");
  const clicks = aggregate(rows, channel, "clicks");
  if (!impressions) return null;
  return clicks / impressions;
}

/** Detect spend spikes, CTR collapses, traffic drops vs 7d baseline. */
export async function detectAnalyticsAnomalies() {
  const supabase = createAdminClient();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const baselineEnd = new Date(yesterday);
  baselineEnd.setUTCDate(baselineEnd.getUTCDate() - 1);
  const baselineStart = new Date(baselineEnd);
  baselineStart.setUTCDate(baselineStart.getUTCDate() - 6);

  const y = isoDate(yesterday);
  const bFrom = isoDate(baselineStart);
  const bTo = isoDate(baselineEnd);

  const { data: brands } = await supabase
    .from("brands")
    .select("id, organization_id, name")
    .limit(500);

  let inserted = 0;

  for (const brand of brands ?? []) {
    const { data: recent } = await supabase
      .from("analytics_daily")
      .select("*")
      .eq("organization_id", brand.organization_id)
      .eq("brand_id", brand.id)
      .eq("metric_date", y);

    const { data: baseline } = await supabase
      .from("analytics_daily")
      .select("*")
      .eq("organization_id", brand.organization_id)
      .eq("brand_id", brand.id)
      .gte("metric_date", bFrom)
      .lte("metric_date", bTo);

    const dayRows = (recent ?? []) as AnalyticsDaily[];
    const baseRows = (baseline ?? []) as AnalyticsDaily[];
    if (!dayRows.length && !baseRows.length) continue;

    const candidates: Candidate[] = [];
    const channels = [
      "all",
      ...new Set(dayRows.map((r) => r.channel)),
    ] as Array<AnalyticsChannel | "all">;

    for (const channel of channels) {
      const daySpend = aggregate(dayRows, channel, "spend_pence");
      const baseSpend = aggregate(baseRows, channel, "spend_pence") / 7;
      if (baseSpend > 500 && daySpend > baseSpend * 1.75) {
        const delta = pctDelta(daySpend, baseSpend);
        candidates.push({
          brand_id: brand.id,
          organization_id: brand.organization_id,
          metric_date: y,
          channel: channel === "all" ? "all" : channel,
          metric_key: "spend_pence",
          severity: delta > 150 ? "critical" : "warning",
          title: `Spend spike${channel !== "all" ? ` · ${ANALYTICS_CHANNEL_LABELS[channel]}` : ""}`,
          detail: `Spend £${(daySpend / 100).toFixed(0)} vs 7-day avg £${(baseSpend / 100).toFixed(0)} (+${delta}%).`,
          current_value: daySpend,
          baseline_value: Math.round(baseSpend),
          delta_pct: delta,
        });
      }

      const daySessions = aggregate(dayRows, channel, "sessions");
      const baseSessions = aggregate(baseRows, channel, "sessions") / 7;
      if (baseSessions >= 50 && daySessions < baseSessions * 0.55) {
        const delta = pctDelta(daySessions, baseSessions);
        candidates.push({
          brand_id: brand.id,
          organization_id: brand.organization_id,
          metric_date: y,
          channel: channel === "all" ? "all" : channel,
          metric_key: "sessions",
          severity: delta < -60 ? "critical" : "warning",
          title: `Traffic drop${channel !== "all" ? ` · ${ANALYTICS_CHANNEL_LABELS[channel]}` : ""}`,
          detail: `Sessions ${Math.round(daySessions)} vs 7-day avg ${Math.round(baseSessions)} (${delta}%).`,
          current_value: daySessions,
          baseline_value: Math.round(baseSessions),
          delta_pct: delta,
        });
      }

      const dayCtr = ctr(dayRows, channel);
      const baseCtr = ctr(baseRows, channel);
      const dayImpr = aggregate(dayRows, channel, "impressions");
      if (
        dayCtr != null &&
        baseCtr != null &&
        baseCtr > 0.005 &&
        dayImpr >= 1000 &&
        dayCtr < baseCtr * 0.55
      ) {
        const delta = pctDelta(dayCtr, baseCtr);
        candidates.push({
          brand_id: brand.id,
          organization_id: brand.organization_id,
          metric_date: y,
          channel: channel === "all" ? "all" : channel,
          metric_key: "ctr",
          severity: "warning",
          title: `CTR collapse${channel !== "all" ? ` · ${ANALYTICS_CHANNEL_LABELS[channel]}` : ""}`,
          detail: `CTR ${(dayCtr * 100).toFixed(2)}% vs baseline ${(baseCtr * 100).toFixed(2)}% (${delta}%).`,
          current_value: Math.round(dayCtr * 10000) / 100,
          baseline_value: Math.round(baseCtr * 10000) / 100,
          delta_pct: delta,
        });
      }
    }

    for (const c of candidates.slice(0, 5)) {
      const { data: existing } = await supabase
        .from("analytics_anomalies")
        .select("id")
        .eq("brand_id", c.brand_id)
        .eq("metric_date", c.metric_date)
        .eq("metric_key", c.metric_key)
        .eq("channel", c.channel)
        .maybeSingle();
      if (existing) continue;

      let aiContext: string | null = null;
      try {
        const gen = await generateAnomalyContext({
          brandName: brand.name,
          title: c.title,
          detail: c.detail,
          metricKey: c.metric_key,
          deltaPct: c.delta_pct,
        });
        aiContext = gen.data.context;
      } catch {
        aiContext = null;
      }

      const { error } = await supabase.from("analytics_anomalies").insert({
        organization_id: c.organization_id,
        brand_id: c.brand_id,
        metric_date: c.metric_date,
        channel: c.channel,
        metric_key: c.metric_key,
        severity: c.severity,
        title: c.title,
        detail: c.detail,
        current_value: c.current_value,
        baseline_value: c.baseline_value,
        delta_pct: c.delta_pct,
        ai_context: aiContext,
      });
      if (error) continue;
      inserted += 1;

      const { data: owners } = await supabase
        .from("organization_members")
        .select("user_id")
        .eq("organization_id", c.organization_id)
        .in("role", ["org_owner", "org_admin"])
        .eq("status", "active")
        .limit(5);

      for (const owner of owners ?? []) {
        await notifyUser({
          organizationId: c.organization_id,
          userId: owner.user_id,
          title: c.title,
          body: aiContext ? `${c.detail}\n\n${aiContext}` : c.detail,
          link: "/data",
          category: "anomalies",
        });
      }
    }
  }

  return { inserted, metricDate: y };
}
