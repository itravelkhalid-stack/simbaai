import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { DepartmentLiveStats } from "@/lib/team/stats";
import { formatRelativeTime } from "@/lib/team/stats";
import { cn } from "@/lib/utils";

export function DepartmentCard({ stats }: { stats: DepartmentLiveStats }) {
  return (
    <Link
      href={`/team/${stats.department}`}
      className={cn(
        "group flex flex-col rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border transition-colors",
        "hover:ring-brand/40",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink group-hover:text-primary">
          {stats.label}
        </h2>
        {stats.failingCount > 0 ? (
          <Badge variant="danger">{stats.failingCount} failing</Badge>
        ) : (
          <Badge variant="success">Healthy</Badge>
        )}
      </div>
      <p className="mt-1.5 text-sm text-ink-soft">{stats.blurb}</p>
      <div className="mt-4 flex flex-wrap gap-3 text-xs text-ink-soft">
        <span>
          <span className="font-medium tabular-nums text-ink">
            {stats.agentCount}
          </span>{" "}
          agents
        </span>
        <span>
          <span className="font-medium tabular-nums text-ink">
            {stats.runs7d}
          </span>{" "}
          runs · 7d
        </span>
        <span>Active {formatRelativeTime(stats.lastActivityAt)}</span>
      </div>
    </Link>
  );
}
