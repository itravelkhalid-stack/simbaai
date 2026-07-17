export function RankBars({
  points,
}: {
  points: Array<{ date: string; position: number }>;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No rank history yet.</p>;
  }
  // Lower position is better — invert for bar height
  const max = Math.max(...points.map((p) => p.position), 1);
  const height = 120;
  const gap = 4;
  const barWidth = Math.max(8, Math.floor(480 / points.length) - gap);

  return (
    <svg
      viewBox={`0 0 ${points.length * (barWidth + gap)} ${height + 24}`}
      className="h-40 w-full"
      role="img"
      aria-label="Average position by day"
    >
      {points.map((point, i) => {
        const h = Math.round(((max - point.position + 1) / max) * height);
        const x = i * (barWidth + gap);
        const y = height - h;
        return (
          <g key={point.date}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(h, 2)}
              rx={3}
              className="fill-foreground/80"
            />
            {i % Math.ceil(points.length / 7) === 0 ? (
              <text
                x={x + barWidth / 2}
                y={height + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px]"
              >
                {point.date.slice(5)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
