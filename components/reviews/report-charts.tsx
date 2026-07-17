"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReportChartPoint, ReportContent } from "@/lib/types/reviews";

function chartData(series: ReportChartPoint[]) {
  return series.map((p) => ({
    date: p.date.slice(5),
    spend: Math.round((p.spend_pence ?? 0) / 100),
    revenue: Math.round((p.revenue_pence ?? 0) / 100),
    seo: p.seo_clicks ?? 0,
    email: p.email_opens ?? 0,
    content: p.content_engagements ?? 0,
  }));
}

export function ReportCharts({
  content,
}: {
  content: ReportContent;
}) {
  const data = chartData(content.series ?? []);
  const primary = content.branding?.primary_color ?? "#0f766e";
  const secondary = content.branding?.secondary_color ?? "#134e4a";

  if (!data.length) {
    return (
      <p className="text-sm text-muted-foreground">No time-series data for charts.</p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-64 rounded-xl border p-3">
        <p className="mb-2 text-sm font-medium">Spend vs revenue (£)</p>
        <ResponsiveContainer width="100%" height="90%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="spend"
              stroke={secondary}
              fill={secondary}
              fillOpacity={0.25}
              name="Spend"
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={primary}
              fill={primary}
              fillOpacity={0.35}
              name="Revenue"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="h-64 rounded-xl border p-3">
        <p className="mb-2 text-sm font-medium">Channel activity</p>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="seo" fill={primary} name="SEO clicks" />
            <Bar dataKey="email" fill={secondary} name="Email opens" />
            <Bar dataKey="content" fill="#64748b" name="Content eng." />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
