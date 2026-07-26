"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  AnalyticsChartSpec,
  ChannelMixRow,
  CohortRow,
  FunnelTotals,
} from "@/lib/types/analytics";
import { ANALYTICS_CHANNEL_LABELS } from "@/lib/types/analytics";
import { CHART, CHART_SERIES } from "@/lib/charts/colors";

export function FunnelChart({
  current,
  prior,
}: {
  current: FunnelTotals;
  prior?: FunnelTotals | null;
}) {
  const data = [
    {
      stage: "Impressions",
      current: current.impressions,
      prior: prior?.impressions ?? 0,
    },
    { stage: "Clicks", current: current.clicks, prior: prior?.clicks ?? 0 },
    { stage: "Leads", current: current.leads, prior: prior?.leads ?? 0 },
    { stage: "Sales", current: current.sales, prior: prior?.sales ?? 0 },
  ];

  return (
    <div className="h-72 rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Funnel</p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="current" fill={CHART.primary} name="Current" radius={4} />
          {prior ? (
            <Bar dataKey="prior" fill={CHART.muted} name="Compare" radius={4} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChannelMixChart({ rows }: { rows: ChannelMixRow[] }) {
  const data = rows.map((r) => ({
    channel: ANALYTICS_CHANNEL_LABELS[r.channel] ?? r.channel,
    spend: Math.round(r.spend_pence / 100),
    revenue: Math.round(r.revenue_pence / 100),
    clicks: r.clicks,
  }));

  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground">No channel mix yet.</p>
    );
  }

  return (
    <div className="h-72 rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Channel mix (£)</p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="channel" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="spend" fill={CHART.secondary} name="Spend" radius={4} />
          <Bar dataKey="revenue" fill={CHART.primary} name="Revenue" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CohortChart({ rows }: { rows: CohortRow[] }) {
  const data = rows.map((r) => ({
    month: r.acquisition_month,
    revenue: Math.round(r.revenue_pence / 100),
    orders: r.orders,
  }));

  if (!data.length) return null;

  return (
    <div className="h-72 rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">
        Revenue by acquisition month
      </p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="revenue" fill={CHART.primary} name="Revenue £" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChart({
  series,
}: {
  series: Array<{
    date: string;
    impressions: number;
    clicks: number;
    sessions: number;
  }>;
}) {
  if (!series.length) {
    return (
      <p className="text-sm text-muted-foreground">No daily series yet.</p>
    );
  }

  return (
    <div className="h-72 rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Daily trend</p>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={series}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="sessions"
            stroke={CHART.primary}
            dot={false}
            name="Sessions"
          />
          <Line
            type="monotone"
            dataKey="clicks"
            stroke={CHART.secondary}
            dot={false}
            name="Clicks"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AskChart({ chart }: { chart: AnalyticsChartSpec }) {
  if (!chart.data.length) {
    return (
      <p className="text-sm text-muted-foreground">No chart data for this answer.</p>
    );
  }

  const common = (
    <>
      <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
      <XAxis dataKey={chart.xKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip />
      <Legend />
    </>
  );

  return (
    <div className="mt-2 h-56 rounded-lg border bg-background/50 p-2">
      <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">
        {chart.title}
      </p>
      <ResponsiveContainer width="100%" height="90%">
        {chart.type === "line" ? (
          <LineChart data={chart.data}>
            {common}
            {chart.series.map((s, i) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={CHART_SERIES[i % CHART_SERIES.length]}
                dot={false}
              />
            ))}
          </LineChart>
        ) : chart.type === "area" ? (
          <AreaChart data={chart.data}>
            {common}
            {chart.series.map((s, i) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                fill={CHART_SERIES[i % CHART_SERIES.length]}
                fillOpacity={0.35}
                stroke={CHART_SERIES[i % CHART_SERIES.length]}
              />
            ))}
          </AreaChart>
        ) : (
          <BarChart data={chart.data}>
            {common}
            {chart.series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={CHART_SERIES[i % CHART_SERIES.length]}
                radius={4}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
