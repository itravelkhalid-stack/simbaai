import { aggregateMetrics } from "@/lib/ads/metric-math";
import {
  GA4_REVENUE_SETUP_BLOCKER,
  hasGa4RevenueTracking,
} from "@/lib/data/ga4-conversion-events";
import { previewUpcomingMeetings } from "@/lib/meetings/schedule";
import { parseMeetingsSettings } from "@/lib/meetings/settings";
import { createClient } from "@/lib/supabase/server";
import type { AdMetricDaily } from "@/lib/types/ads";
import type { Meeting } from "@/lib/types/meetings";
import { MEETING_TYPE_LABELS } from "@/lib/types/meetings";

export type DashboardAttentionItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  tone: "warning" | "danger";
};

export type DashboardActivityItem = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  at: string;
};

export type DashboardUpcomingMeeting = {
  key: string;
  title: string;
  when: string;
  brand: string;
  href?: string;
};

function money(pence: number) {
  return `£${(pence / 100).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function pctDelta(current: number, previous: number): {
  label: string;
  tone: "up" | "down" | "neutral";
} | null {
  if (previous === 0) {
    if (current === 0) return null;
    return { label: "new", tone: "neutral" };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { label: "0%", tone: "neutral" };
  return {
    label: `${Math.abs(pct)}%`,
    tone: pct > 0 ? "up" : "down",
  };
}

export async function loadDashboardHome(organizationId: string) {
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);
  const priorSince = new Date(since);
  priorSince.setDate(priorSince.getDate() - 7);
  const priorSinceStr = priorSince.toISOString().slice(0, 10);

  const [
    { data: metrics },
    { data: priorMetrics },
    { count: pendingContent },
    { count: pendingCreatives },
    { count: pendingCampaigns },
    { count: publishFailed },
    { data: failedMeetings },
    { data: notifications },
    { data: brands },
    { data: org },
    { data: recentMeetings },
    { data: ga4Connections },
  ] = await Promise.all([
    supabase
      .from("ad_metrics_daily")
      .select("spend_pence, impressions, clicks, conversions, revenue_pence")
      .eq("organization_id", organizationId)
      .gte("metric_date", sinceStr),
    supabase
      .from("ad_metrics_daily")
      .select("spend_pence, impressions, clicks, conversions, revenue_pence")
      .eq("organization_id", organizationId)
      .gte("metric_date", priorSinceStr)
      .lt("metric_date", sinceStr),
    supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending_approval"),
    supabase
      .from("ad_creatives")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending_approval"),
    supabase
      .from("ad_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "pending_approval"),
    supabase
      .from("content_items")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "publish_failed"),
    supabase
      .from("meetings")
      .select("id, title, blockers, status, scheduled_for")
      .eq("organization_id", organizationId)
      .eq("status", "failed")
      .order("scheduled_for", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id, title, body, link, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .single(),
    supabase
      .from("meetings")
      .select("id, title, type, scheduled_for, status, brand_id")
      .eq("organization_id", organizationId)
      .eq("status", "scheduled")
      .gte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(6),
    supabase
      .from("ga4_connections")
      .select(
        "id, brand_id, status, property_id, conversion_event_names, discovered_event_names",
      )
      .eq("organization_id", organizationId)
      .limit(50),
  ]);

  const current = aggregateMetrics((metrics ?? []) as AdMetricDaily[]);
  const previous = aggregateMetrics((priorMetrics ?? []) as AdMetricDaily[]);
  const spendDelta = pctDelta(current.spend_pence, previous.spend_pence);
  const roasDelta = pctDelta(current.roas, previous.roas);

  const approvals =
    (pendingContent ?? 0) + (pendingCreatives ?? 0) + (pendingCampaigns ?? 0);

  const kpis = [
    {
      label: "Ad spend (7d)",
      value: money(current.spend_pence),
      delta: spendDelta?.label,
      deltaTone: spendDelta?.tone ?? "neutral",
    },
    {
      label: "ROAS (7d)",
      value: current.roas ? `${current.roas.toFixed(2)}x` : "—",
      delta: roasDelta?.label,
      // Higher ROAS is good
      deltaTone: roasDelta?.tone ?? "neutral",
    },
    {
      label: "Pending approvals",
      value: String(approvals),
      delta: approvals > 0 ? "review" : undefined,
      deltaTone: "neutral" as const,
    },
    {
      label: "Impressions (7d)",
      value: current.impressions.toLocaleString(),
      delta: pctDelta(current.impressions, previous.impressions)?.label,
      deltaTone:
        pctDelta(current.impressions, previous.impressions)?.tone ?? "neutral",
    },
  ] as const;

  const attention: DashboardAttentionItem[] = [];

  const brandMap = new Map((brands ?? []).map((b) => [b.id, b.name]));

  for (const conn of ga4Connections ?? []) {
    const connected =
      conn.status !== "error" && Boolean(conn.property_id);
    if (!connected) continue;
    const ready = hasGa4RevenueTracking({
      conversionEventNames: conn.conversion_event_names,
      discoveredEventNames: conn.discovered_event_names,
    });
    if (ready) continue;
    const brandName = brandMap.get(conn.brand_id) ?? "Brand";
    attention.push({
      id: `ga4-revenue-${conn.brand_id}`,
      title: `${GA4_REVENUE_SETUP_BLOCKER.title} (${brandName})`,
      detail: GA4_REVENUE_SETUP_BLOCKER.detail,
      href: `${GA4_REVENUE_SETUP_BLOCKER.href}?brandId=${conn.brand_id}`,
      cta: GA4_REVENUE_SETUP_BLOCKER.cta,
      tone: "warning",
    });
  }

  if ((pendingContent ?? 0) > 0) {
    attention.push({
      id: "content-approvals",
      title: `${pendingContent} content item${pendingContent === 1 ? "" : "s"} awaiting approval`,
      detail: "Review drafts before they publish to social.",
      href: "/content/queue",
      cta: "Open queue",
      tone: "warning",
    });
  }
  if ((pendingCreatives ?? 0) + (pendingCampaigns ?? 0) > 0) {
    const n = (pendingCreatives ?? 0) + (pendingCampaigns ?? 0);
    attention.push({
      id: "ads-approvals",
      title: `${n} ads item${n === 1 ? "" : "s"} awaiting approval`,
      detail: "Creative and launch approvals before spend goes live.",
      href: "/ads/approvals",
      cta: "Review ads",
      tone: "warning",
    });
  }
  if ((publishFailed ?? 0) > 0) {
    attention.push({
      id: "publish-failed",
      title: `${publishFailed} publish failure${publishFailed === 1 ? "" : "s"}`,
      detail: "Posts failed to reach the platform — fix and retry.",
      href: "/content/queue",
      cta: "Fix posts",
      tone: "danger",
    });
  }

  for (const m of (failedMeetings ?? []) as Array<
    Pick<Meeting, "id" | "title" | "blockers">
  >) {
    const human = (m.blockers ?? []).some((b) => b.needs_human);
    attention.push({
      id: `meeting-${m.id}`,
      title: human
        ? `Meeting needs you: ${m.title}`
        : `Meeting failed: ${m.title}`,
      detail: human
        ? "Blockers flagged for human follow-up."
        : "Generation failed — open minutes or re-run.",
      href: `/meetings/${m.id}`,
      cta: "Open meeting",
      tone: human ? "warning" : "danger",
    });
  }

  const settings = parseMeetingsSettings(
    org?.settings as Record<string, unknown>,
  );

  const upcomingFromDb = ((recentMeetings ?? []) as Meeting[]).map((m) => ({
    key: m.id,
    title: m.title || MEETING_TYPE_LABELS[m.type],
    when: new Date(m.scheduled_for).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
    brand: brandMap.get(m.brand_id) ?? "Brand",
    href: `/meetings/${m.id}`,
  }));

  const upcomingPreview =
    upcomingFromDb.length >= 4
      ? []
      : previewUpcomingMeetings({
          settings,
          brandIds: (brands ?? []).map((b) => b.id),
          hoursAhead: 24 * 14,
        })
          .slice(0, 6 - upcomingFromDb.length)
          .map((slot) => ({
            key: `${slot.brandId}-${slot.type}-${slot.dateKey}`,
            title: MEETING_TYPE_LABELS[slot.type],
            when: new Date(slot.at).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
            brand: brandMap.get(slot.brandId) ?? "Brand",
          }));

  const upcoming: DashboardUpcomingMeeting[] = [
    ...upcomingFromDb,
    ...upcomingPreview,
  ].slice(0, 6);

  const activity: DashboardActivityItem[] = (notifications ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    href: n.link,
    at: n.created_at,
  }));

  return { kpis, attention, activity, upcoming, timezone: settings.timezone };
}
