import { MetricCard } from "@/components/brand/metric-card";
import { CHART } from "@/lib/charts/colors";
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
  spendDelta,
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
  spendDelta?: number | null;
}) {
  const cards = [
    {
      label: "Spend",
      value: formatPence(spend, currency),
      delta:
        spendDelta == null
          ? undefined
          : `${spendDelta >= 0 ? "+" : ""}${spendDelta.toFixed(1)}%`,
      deltaTone:
        spendDelta == null
          ? ("neutral" as const)
          : spendDelta >= 0
            ? ("up" as const)
            : ("down" as const),
    },
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
        <MetricCard
          key={card.label}
          label={card.label}
          value={card.value}
          delta={"delta" in card ? card.delta : undefined}
          deltaTone={"deltaTone" in card ? card.deltaTone : undefined}
        />
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
    return <p className="text-sm text-ink-soft">No metric data in range.</p>;
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
              height={Math.max(h, 0)}
              rx={3}
              fill={CHART.primary}
            />
            {i % Math.ceil(days.length / 7) === 0 ? (
              <text
                x={x + barWidth / 2}
                y={height + 14}
                textAnchor="middle"
                fill={CHART.muted}
                fontSize={8}
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

export function SpendPacingBar({
  spentPence,
  budgetPence,
  days,
}: {
  spentPence: number;
  budgetPence: number | null;
  days: number;
}) {
  if (!budgetPence || budgetPence <= 0) {
    return <span className="text-xs text-ink-soft">No daily budget</span>;
  }
  const expected = budgetPence * Math.max(days, 1);
  const pct = Math.min(100, Math.round((spentPence / expected) * 100));
  const over = spentPence > expected * 1.05;
  const under = spentPence < expected * 0.7;

  return (
    <div className="min-w-28 space-y-1">
      <div className="flex justify-between text-[11px] text-ink-soft">
        <span>{pct}% of pace</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={
            over
              ? "h-full rounded-full bg-danger"
              : under
                ? "h-full rounded-full bg-warning"
                : "h-full rounded-full bg-brand"
          }
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
