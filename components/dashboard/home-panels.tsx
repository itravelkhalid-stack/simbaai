import Link from "next/link";

import { MetricCard } from "@/components/brand/metric-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type {
  DashboardActivityItem,
  DashboardAttentionItem,
  DashboardUpcomingMeeting,
} from "@/lib/dashboard/home";
import { cn } from "@/lib/utils";

export function DashboardKpiRow({
  kpis,
}: {
  kpis: Array<{
    label: string;
    value: string;
    delta?: string;
    deltaTone: "up" | "down" | "neutral";
  }>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <MetricCard
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          delta={kpi.delta}
          deltaTone={kpi.deltaTone}
        />
      ))}
    </div>
  );
}

export function AttentionPanel({ items }: { items: DashboardAttentionItem[] }) {
  if (!items.length) {
    return (
      <section className="rounded-lg bg-success-soft/60 p-5 ring-1 ring-border">
        <p className="font-heading text-base font-semibold text-ink">
          All clear
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          No blockers or approvals waiting right now.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Needs attention
        </h2>
        <Badge variant="warning">{items.length}</Badge>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <li
            key={item.id}
            className={cn(
              "flex flex-col gap-3 rounded-lg p-4 ring-1",
              item.tone === "danger"
                ? "bg-danger-soft/70 ring-danger/30"
                : "bg-warning-soft ring-warning/40",
            )}
          >
            <div className="space-y-1">
              <p className="font-medium text-ink">{item.title}</p>
              <p className="text-sm text-ink-soft">{item.detail}</p>
            </div>
            <div>
              <Link
                href={item.href}
                className={cn(buttonVariants({ size: "sm" }))}
              >
                {item.cta}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ActivityFeed({ items }: { items: DashboardActivityItem[] }) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
      <h2 className="font-heading text-lg font-semibold text-ink">
        Recent activity
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          No notifications yet — agent runs and approvals will show up here.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className="block transition-colors hover:text-primary"
                >
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                </Link>
              ) : (
                <p className="text-sm font-medium text-ink">{item.title}</p>
              )}
              {item.body ? (
                <p className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                  {item.body}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-ink-soft">
                {new Date(item.at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function UpcomingMeetingsPanel({
  items,
  timezone,
}: {
  items: DashboardUpcomingMeeting[];
  timezone: string;
}) {
  return (
    <section className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Upcoming meetings
        </h2>
        <Link
          href="/meetings"
          className="text-sm font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </div>
      <p className="mt-1 text-xs text-ink-soft">Timezone {timezone}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          Nothing scheduled in the next two weeks.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const inner = (
              <>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {item.title}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {item.brand} · {item.when}
                  </p>
                </div>
                <Badge variant="warning">scheduled</Badge>
              </>
            );
            return (
              <li key={item.key}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-md px-1 py-1 transition-colors hover:bg-surface-soft"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-1 py-1">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
