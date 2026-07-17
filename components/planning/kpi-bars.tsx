import type { PlanKpi } from "@/lib/types/planning";

export function KpiProgressBars({ kpis }: { kpis: PlanKpi[] }) {
  if (!kpis.length) {
    return <p className="text-sm text-muted-foreground">No KPIs defined.</p>;
  }

  return (
    <ul className="space-y-3">
      {kpis.map((kpi) => {
        const current = Number(kpi.current ?? 0);
        const target = Number(kpi.target || 1);
        const pct = Math.min(Math.round((current / target) * 100), 100);
        return (
          <li key={kpi.metric}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium">{kpi.metric}</span>
              <span className="text-muted-foreground">
                {current}
                {kpi.unit ? ` ${kpi.unit}` : ""} / {kpi.target}
                {kpi.unit ? ` ${kpi.unit}` : ""}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
