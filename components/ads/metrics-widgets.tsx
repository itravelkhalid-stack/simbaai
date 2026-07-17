import { formatPence } from "@/lib/ads/format";

export function MetricCards({
  spend,
  impressions,
  clicks,
  conversions,
  roas,
  cpm,
  cpc,
  ctr,
  currency = "GBP",
}: {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
  cpm: number;
  cpc: number;
  ctr: number;
  currency?: string;
}) {
  const cards = [
    { label: "Spend", value: formatPence(spend, currency) },
    { label: "Impressions", value: impressions.toLocaleString() },
    { label: "Clicks", value: clicks.toLocaleString() },
    { label: "Conversions", value: conversions.toFixed(1) },
    { label: "ROAS", value: `${roas.toFixed(2)}x` },
    { label: "CPM", value: formatPence(Math.round(cpm * 100), currency) },
    { label: "CPC", value: formatPence(cpc, currency) },
    { label: "CTR", value: `${(ctr * 100).toFixed(2)}%` },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border p-4">
          <p className="text-xs text-muted-foreground">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{card.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Simple SVG bar chart for daily spend — no chart library. */
export function SpendBars({
  days,
}: {
  days: Array<{ date: string; spend_pence: number }>;
}) {
  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No metric data in range.</p>
    );
  }
  const max = Math.max(...days.map((d) => d.spend_pence), 1);
  const height = 120;
  const gap = 4;
  const barWidth = Math.max(8, Math.floor(520 / days.length) - gap);

  return (
    <svg
      viewBox={`0 0 ${days.length * (barWidth + gap)} ${height + 24}`}
      className="h-40 w-full"
      role="img"
      aria-label="Daily spend chart"
    >
      {days.map((day, i) => {
        const h = Math.round((day.spend_pence / max) * height);
        const x = i * (barWidth + gap);
        const y = height - h;
        return (
          <g key={day.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={3}
              className="fill-foreground/80"
            />
            {i % Math.ceil(days.length / 7) === 0 ? (
              <text
                x={x + barWidth / 2}
                y={height + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px]"
              >
                {day.date.slice(5)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
