import type { FormatInventoryRow } from "@/lib/media/inventory";

export function ImageLibraryHealthCard({
  rows,
}: {
  rows: FormatInventoryRow[];
}) {
  const asks = rows.filter((r) => r.ask);
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="font-medium">Image library health</h2>
        <p className="text-sm text-muted-foreground">
          Unused suitable images vs cadence (14-day reuse window). Upload
          format-fit assets before days run out.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <li
            key={row.slot}
            className="flex items-baseline justify-between gap-2 text-sm"
          >
            <span>{row.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {row.unusedCount} unused / {row.suitableCount} suitable
              {row.daysRemaining != null ? ` · ~${row.daysRemaining}d` : ""}
            </span>
          </li>
        ))}
      </ul>
      {asks.length ? (
        <ul className="space-y-1 border-t pt-3 text-sm text-amber-800 dark:text-amber-200">
          {asks.map((r) => (
            <li key={r.slot}>{r.ask}</li>
          ))}
        </ul>
      ) : (
        <p className="border-t pt-3 text-sm text-muted-foreground">
          Inventory looks healthy for current cadence.
        </p>
      )}
    </section>
  );
}
