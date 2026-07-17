import type { Campaign } from "@/lib/types/planning";

function daysBetween(a: string, b: string) {
  const ms =
    new Date(`${b}T00:00:00Z`).getTime() -
    new Date(`${a}T00:00:00Z`).getTime();
  return Math.max(Math.round(ms / 86400000), 0);
}

export function CampaignGantt({
  campaigns,
  periodStart,
  periodEnd,
}: {
  campaigns: Campaign[];
  periodStart: string;
  periodEnd: string;
}) {
  const totalDays = Math.max(daysBetween(periodStart, periodEnd), 1);

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{periodStart}</span>
        <span>{periodEnd}</span>
      </div>
      <ul className="space-y-3">
        {campaigns.length === 0 ? (
          <li className="text-sm text-muted-foreground">No campaigns in range.</li>
        ) : (
          campaigns.map((c) => {
            const start = c.start_date ?? periodStart;
            const end = c.end_date ?? periodEnd;
            const offset = Math.min(
              Math.max(daysBetween(periodStart, start), 0),
              totalDays,
            );
            const width = Math.max(
              daysBetween(start, end) + 1,
              1,
            );
            const leftPct = (offset / totalDays) * 100;
            const widthPct = Math.min((width / totalDays) * 100, 100 - leftPct);

            return (
              <li key={c.id} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.status}</span>
                </div>
                <div className="relative h-8 rounded-md bg-muted/50">
                  <div
                    className="absolute top-1 bottom-1 rounded bg-foreground/80"
                    style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` }}
                    title={`${start} → ${end}`}
                  />
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
