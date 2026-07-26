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
  LIFECYCLE_LABELS,
  type CrmLifecycleStage,
  type FunnelStageStat,
} from "@/lib/types/crm";
import { CHART } from "@/lib/charts/colors";

export function LifecycleFunnelChart({ stats }: { stats: FunnelStageStat[] }) {
  const data = stats
    .filter((s) => s.stage !== "churned")
    .map((s) => ({
      stage: LIFECYCLE_LABELS[s.stage as CrmLifecycleStage],
      current: s.count,
      previous: s.previous_count,
      conversion: s.conversion_from_prev_pct,
    }));

  return (
    <div className="h-72 rounded-xl border p-4">
      <p className="mb-2 text-sm font-medium">Lifecycle funnel</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Stage counts with prior-window comparison. Conversion labels show step rates.
      </p>
      <ResponsiveContainer width="100%" height="80%">
        <BarChart data={data}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(value, name) => [value, name === "current" ? "Current" : "Prior window"]}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload as { conversion?: number | null };
              const conv =
                row?.conversion != null ? ` · conv ${row.conversion}%` : "";
              return `${label}${conv}`;
            }}
          />
          <Legend />
          <Bar dataKey="current" fill={CHART.primary} name="Current" radius={4} />
          <Bar dataKey="previous" fill={CHART.muted} name="Prior window" radius={4} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
