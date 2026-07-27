import { Badge } from "@/components/ui/badge";
import type {
  MeetingActionOutcome,
  MeetingDecision,
} from "@/lib/types/meetings";
import { cn } from "@/lib/utils";

export function DecisionCallout({ decision }: { decision: MeetingDecision }) {
  return (
    <div className="rounded-lg bg-brand-soft/80 p-4 ring-1 ring-brand/20">
      <p className="font-medium text-ink">{decision.title}</p>
      <p className="mt-1 text-sm text-ink-soft">{decision.rationale}</p>
      {decision.owner ? (
        <p className="mt-2 text-xs font-medium text-primary">
          Owner · {decision.owner}
        </p>
      ) : null}
    </div>
  );
}

export function ActionChecklist({
  title,
  items,
  empty,
  checked,
}: {
  title: string;
  items: MeetingActionOutcome[];
  empty: string;
  checked?: boolean;
}) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
      <h2 className="font-heading text-base font-semibold text-ink">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  checked
                    ? "bg-success-soft text-primary"
                    : "bg-warning-soft text-ink",
                )}
              >
                {checked ? "✓" : "○"}
              </span>
              <div className="min-w-0 space-y-1">
                <p className="text-sm text-ink">{item.description}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="neutral">{item.action_type}</Badge>
                  <Badge variant={checked ? "success" : "warning"}>
                    {item.status}
                  </Badge>
                </div>
                {item.detail ? (
                  <p className="text-xs text-ink-soft">{item.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
