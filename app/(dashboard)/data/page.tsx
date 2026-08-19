import {
  ChannelMixChart,
  CohortChart,
  FunnelChart,
  TrendChart,
} from "@/components/data/analytics-charts";
import { AskYourDataChat } from "@/components/data/ask-chat";
import { DataNav } from "@/components/data/data-nav";
import { Button } from "@/components/ui/button";
import {
  acknowledgeAnomaly,
  runRollupNow,
} from "@/lib/data/actions";
import {
  buildChannelMix,
  buildDailySeries,
  buildFunnel,
  compareFunnels,
  defaultDateRange,
  fetchAnalyticsDaily,
  getRevenueByAcquisitionMonth,
  getTopCampaigns,
  getTopContent,
  rangeLengthDays,
  shiftRange,
} from "@/lib/data/metrics";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalyticsAnomaly,
  AnalyticsChatMessage,
} from "@/lib/types/analytics";
import { ANALYTICS_CHANNEL_LABELS } from "@/lib/types/analytics";
import { PageHeader } from "@/components/dashboard/page-header";
import { fieldInputClass, fieldSelectClass } from "@/lib/ui/field";

export default async function DataDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    brandId?: string;
    from?: string;
    to?: string;
    compare?: string;
  }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();
  const defaults = defaultDateRange(30);

  const from = params.from || defaults.from;
  const to = params.to || defaults.to;
  const compare = params.compare !== "0" && params.compare !== "false";

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const brandId = params.brandId || brands?.[0]?.id;

  if (!brandId) {
    return (
      <div className="space-y-6">
        <PageHeader title="Data" description="Create a brand first." />
      </div>
    );
  }

  const priorRange = shiftRange({ from, to }, rangeLengthDays({ from, to }));

  const [
    currentRows,
    priorRows,
    topContent,
    topCampaigns,
    cohorts,
    { data: anomalies },
    { data: chatMessages },
    { data: ga4 },
  ] = await Promise.all([
    fetchAnalyticsDaily({
      organizationId: active.organization_id,
      brandId,
      from,
      to,
    }),
    compare
      ? fetchAnalyticsDaily({
          organizationId: active.organization_id,
          brandId,
          from: priorRange.from,
          to: priorRange.to,
        })
      : Promise.resolve([]),
    getTopContent({
      organizationId: active.organization_id,
      brandId,
      from,
      to,
    }),
    getTopCampaigns({
      organizationId: active.organization_id,
      brandId,
      from,
      to,
    }),
    getRevenueByAcquisitionMonth({
      organizationId: active.organization_id,
      brandId,
    }),
    supabase
      .from("analytics_anomalies")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("analytics_chat_messages")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .order("created_at", { ascending: true })
      .limit(40),
    supabase
      .from("ga4_connections")
      .select("id, property_name, property_id, last_sync_at, status, last_error")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .maybeSingle(),
  ]);

  const funnel = buildFunnel(currentRows);
  const priorFunnel = compare ? buildFunnel(priorRows) : null;
  const deltas = priorFunnel ? compareFunnels(funnel, priorFunnel) : null;
  const mix = buildChannelMix(currentRows);
  const series = buildDailySeries(currentRows);
  const spend = currentRows.reduce((a, r) => a + r.spend_pence, 0);
  const revenue = currentRows.reduce((a, r) => a + r.revenue_pence, 0);
  const sessions = currentRows.reduce((a, r) => a + r.sessions, 0);
  const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data"
        description={
          <>
            Unified analytics rollups, GA4 enrichment, ask-your-data, and anomaly
            alerts.
          </>
        }
      />
      <DataNav current="/data" />

      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/data?brandId=${b.id}&from=${from}&to=${to}&compare=${compare ? "1" : "0"}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border p-3 text-sm">
        <form
          method="get"
          className="flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="brandId" value={brandId} />
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">From</span>
            <input
              type="date"
              name="from"
              defaultValue={from}
              className={fieldInputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">To</span>
            <input
              type="date"
              name="to"
              defaultValue={to}
              className={fieldInputClass}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Compare</span>
            <select
              name="compare"
              defaultValue={compare ? "1" : "0"}
              className={fieldSelectClass}
            >
              <option value="1">Prior period</option>
              <option value="0">Off</option>
            </select>
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Apply
          </Button>
        </form>
        <form action={runRollupNow}>
          <Button type="submit" variant="outline" size="sm">
            Rebuild rollups
          </Button>
        </form>
      </div>

      {ga4?.status === "error" ? (
        <div
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
          role="alert"
        >
          <p className="font-medium text-destructive">
            GA4 data may be stale — sync stopped
          </p>
          <p className="mt-1 text-muted-foreground">
            Rollups below may show zeros.{" "}
            <a href="/data/settings" className="underline">
              Reconnect GA4 in settings
            </a>
            .
          </p>
        </div>
      ) : null}

      {ga4 ? (
        <p className="text-xs text-muted-foreground">
          GA4: {ga4.property_name ?? ga4.property_id} · last sync{" "}
          {ga4.last_sync_at
            ? new Date(ga4.last_sync_at).toLocaleString()
            : "never"}{" "}
          · {ga4.status}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          GA4 not connected —{" "}
          <a href="/data/settings" className="underline">
            connect in settings
          </a>
          .
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Spend"
          value={`£${(spend / 100).toLocaleString()}`}
          delta={null}
        />
        <Metric
          label="Revenue"
          value={`£${(revenue / 100).toLocaleString()}`}
          delta={null}
        />
        <Metric label="ROAS" value={roas != null ? `${roas}x` : "—"} delta={null} />
        <Metric
          label="Sessions"
          value={sessions.toLocaleString()}
          delta={deltas?.impressions_delta_pct ?? null}
        />
      </div>

      {deltas ? (
        <p className="text-xs text-muted-foreground">
          vs prior {priorRange.from} → {priorRange.to}: impressions{" "}
          {fmtDelta(deltas.impressions_delta_pct)}, clicks{" "}
          {fmtDelta(deltas.clicks_delta_pct)}, leads{" "}
          {fmtDelta(deltas.leads_delta_pct)}, sales{" "}
          {fmtDelta(deltas.sales_delta_pct)}
        </p>
      ) : null}

      {(anomalies as AnalyticsAnomaly[] | null)?.length ? (
        <section className="rounded-xl border border-amber-500/30 p-4">
          <h2 className="mb-2 text-sm font-medium">Anomaly feed</h2>
          <ul className="space-y-3 text-sm">
            {(anomalies as AnalyticsAnomaly[]).map((a) => (
              <li key={a.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-muted-foreground">{a.detail}</p>
                    {a.ai_context ? (
                      <p className="mt-1 text-muted-foreground">{a.ai_context}</p>
                    ) : null}
                  </div>
                  <form action={acknowledgeAnomaly}>
                    <input type="hidden" name="anomalyId" value={a.id} />
                    <Button type="submit" size="sm" variant="outline">
                      Ack
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <FunnelChart current={funnel} prior={priorFunnel} />
        <ChannelMixChart rows={mix} />
        <TrendChart series={series} />
        <CohortChart rows={cohorts} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-medium">Top content</h2>
          <ul className="divide-y text-sm">
            {topContent.length === 0 ? (
              <li className="py-2 text-muted-foreground">No content metrics.</li>
            ) : (
              topContent.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap justify-between gap-2 py-2"
                >
                  <span className="line-clamp-1">{c.title}</span>
                  <span className="text-muted-foreground">
                    {c.platform} · {c.engagements.toLocaleString()} eng
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-medium">Top campaigns</h2>
          <ul className="divide-y text-sm">
            {topCampaigns.length === 0 ? (
              <li className="py-2 text-muted-foreground">No campaign metrics.</li>
            ) : (
              topCampaigns.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap justify-between gap-2 py-2"
                >
                  <span className="line-clamp-1">{c.name}</span>
                  <span className="text-muted-foreground">
                    £{(c.spend_pence / 100).toFixed(0)}
                    {c.roas != null ? ` · ${c.roas}x` : ""}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {mix.length ? (
        <section className="rounded-xl border p-4">
          <h2 className="mb-3 text-sm font-medium">Channel ROAS</h2>
          <ul className="divide-y text-sm">
            {mix.map((r) => (
              <li
                key={r.channel}
                className="flex flex-wrap justify-between gap-2 py-2"
              >
                <span>{ANALYTICS_CHANNEL_LABELS[r.channel]}</span>
                <span className="text-muted-foreground">
                  {r.roas != null ? `${r.roas}x` : "—"} · £
                  {(r.spend_pence / 100).toFixed(0)} spend
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AskYourDataChat
        brandId={brandId}
        messages={(chatMessages ?? []) as AnalyticsChatMessage[]}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: number | null;
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {delta != null ? (
        <p className="mt-1 text-xs text-muted-foreground">{fmtDelta(delta)}</p>
      ) : null}
    </div>
  );
}

function fmtDelta(n: number | null) {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}
