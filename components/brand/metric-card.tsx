import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  deltaTone = "neutral",
  className,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] text-ink-soft">{label}</p>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium",
              deltaTone === "up" && "bg-success-soft text-ink",
              deltaTone === "down" && "bg-danger-soft text-danger",
              deltaTone === "neutral" && "bg-muted text-ink-soft",
            )}
          >
            {deltaTone === "up" ? "▲ " : deltaTone === "down" ? "▼ " : ""}
            {delta}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-sans text-[28px] font-semibold tabular-nums tracking-tight text-ink">
        {value}
      </p>
    </div>
  );
}
