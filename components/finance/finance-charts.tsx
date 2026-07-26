"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  FINANCE_CHANNEL_LABELS,
  type ChannelBudgetActual,
  type MonthlyPnLRow,
} from "@/lib/types/finance";
import { CHART } from "@/lib/charts/colors";

export function BudgetActualChart({ rows }: { rows: ChannelBudgetActual[] }) {
  const data = rows.map((r) => ({
    channel: FINANCE_CHANNEL_LABELS[r.channel] ?? r.channel,
    planned: Math.round(r.planned_pence / 100),
    actual: Math.round(r.actual_pence / 100),
  }));

  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No budget or spend yet for this period.
      </p>
    );
  }

  return (
    <div className="h-72 rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Budget vs actual (£)</p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="channel" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="planned" fill={CHART.muted} name="Planned" radius={4} />
          <Bar dataKey="actual" fill={CHART.primary} name="Actual" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyPnLChart({ rows }: { rows: MonthlyPnLRow[] }) {
  const data = rows.map((r) => ({
    month: r.month.slice(5),
    spend: Math.round(r.spend_pence / 100),
    revenue: Math.round(r.revenue_pence / 100),
    margin: Math.round(r.gross_margin_pence / 100),
  }));

  return (
    <div className="h-72 rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Monthly marketing P&amp;L (£)</p>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="spend" fill={CHART.secondary} name="Spend" radius={4} />
          <Bar dataKey="revenue" fill={CHART.primary} name="Revenue" radius={4} />
          <Bar dataKey="margin" fill={CHART.emphasis} name="Gross margin" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
