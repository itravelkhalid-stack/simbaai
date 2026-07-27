import Link from "next/link";

import { RunAgentButton } from "@/components/team/run-agent-button";
import { Badge } from "@/components/ui/badge";
import { formatNextRun } from "@/lib/agents/cron-next";
import type { AgentLiveStats } from "@/lib/team/stats";
import { formatCostPence, formatRelativeTime } from "@/lib/team/stats";
import { statusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

function triggerLabel(stats: AgentLiveStats): string {
  const t = stats.entry.trigger;
  if (t.kind === "cron") return `Cron · ${t.schedule}`;
  if (t.kind === "event") return `Event · ${t.event}`;
  return "On demand";
}

export function AgentCard({
  stats,
  brands,
}: {
  stats: AgentLiveStats;
  brands: Array<{ id: string; name: string }>;
}) {
  const { entry, lastRun } = stats;
  const status = lastRun?.status ?? "idle";
  const tone = lastRun ? statusTone(lastRun.status) : "neutral";

  return (
    <article
      className={cn(
        "flex flex-col rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/team/${entry.department}/${entry.id}`}
            className="font-heading text-base font-semibold text-ink hover:text-primary"
          >
            {entry.displayName}
          </Link>
          <p className="text-xs font-medium tracking-wide text-primary uppercase">
            {entry.roleTitle}
          </p>
        </div>
        <Badge variant={tone === "ai" ? "ai" : tone}>
          {status === "idle" ? "No runs yet" : status}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-ink-soft">{entry.responsibility}</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-ink-soft">Last run</dt>
          <dd className="font-medium text-ink">
            {formatRelativeTime(lastRun?.created_at)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Runs · 7d</dt>
          <dd className="font-medium tabular-nums text-ink">
            {stats.runs7d}
            {stats.successRate7d != null
              ? ` · ${Math.round(stats.successRate7d * 100)}%`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Cost · 7d</dt>
          <dd className="font-medium tabular-nums text-ink">
            {formatCostPence(stats.costPence7d)}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Next</dt>
          <dd className="font-medium text-ink">
            {entry.trigger.kind === "cron"
              ? formatNextRun(stats.nextScheduledAt)
              : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-ink-soft">{triggerLabel(stats)}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Link
          href={`/team/${entry.department}/${entry.id}`}
          className="text-sm font-medium text-primary hover:underline"
        >
          View runs
        </Link>
        {entry.runNow ? (
          <RunAgentButton
            agentId={entry.id}
            brands={entry.runNow.requiresBrand ? brands : []}
          />
        ) : null}
      </div>
    </article>
  );
}
