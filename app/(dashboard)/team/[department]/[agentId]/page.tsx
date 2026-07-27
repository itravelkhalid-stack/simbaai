import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { RunAgentButton } from "@/components/team/run-agent-button";
import { Badge } from "@/components/ui/badge";
import {
  DEPARTMENT_META,
  getAgentById,
  isAgentDepartment,
} from "@/lib/agents/registry";
import { formatNextRun } from "@/lib/agents/cron-next";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { resolveRunOutputHref } from "@/lib/team/output-links";
import {
  formatCostPence,
  formatRelativeTime,
  loadAgentLiveStats,
  loadRecentRunsForAgent,
} from "@/lib/team/stats";
import { statusTone } from "@/lib/ui/status";

export default async function TeamAgentDetailPage({
  params,
}: {
  params: Promise<{ department: string; agentId: string }>;
}) {
  const { department: raw, agentId } = await params;
  if (!isAgentDepartment(raw)) notFound();
  const entry = getAgentById(agentId);
  if (!entry || entry.department !== raw) notFound();

  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const [live, runs, { data: brands }] = await Promise.all([
    loadAgentLiveStats(active.organization_id, [entry]),
    loadRecentRunsForAgent(active.organization_id, entry),
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", active.organization_id)
      .order("name"),
  ]);
  const stats = live[0];

  return (
    <div className="space-y-6">
      <div className="text-sm text-ink-soft">
        <Link href="/team" className="hover:text-primary">
          AI Team
        </Link>
        <span className="mx-1.5">/</span>
        <Link
          href={`/team/${entry.department}`}
          className="hover:text-primary"
        >
          {DEPARTMENT_META[entry.department].label}
        </Link>
      </div>

      <PageHeader
        title={entry.displayName}
        description={
          <>
            <span className="font-medium text-primary">{entry.roleTitle}</span>
            {" — "}
            {entry.responsibility}
          </>
        }
        actions={
          entry.runNow ? (
            <RunAgentButton
              agentId={entry.id}
              brands={entry.runNow.requiresBrand ? (brands ?? []) : []}
            />
          ) : null
        }
      />

      <section className="grid gap-3 rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-ink-soft">Last run</p>
          <p className="mt-1 font-medium text-ink">
            {formatRelativeTime(stats?.lastRun?.created_at)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Runs · 7d / success</p>
          <p className="mt-1 font-medium tabular-nums text-ink">
            {stats?.runs7d ?? 0}
            {stats?.successRate7d != null
              ? ` · ${Math.round(stats.successRate7d * 100)}%`
              : ""}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Cost · 7d</p>
          <p className="mt-1 font-medium tabular-nums text-ink">
            {formatCostPence(stats?.costPence7d ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Next scheduled</p>
          <p className="mt-1 font-medium text-ink">
            {entry.trigger.kind === "cron"
              ? formatNextRun(stats?.nextScheduledAt ?? null)
              : "—"}
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Recent runs
        </h2>
        {entry.agentNames.length === 0 ? (
          <p className="rounded-lg bg-card p-5 text-sm text-ink-soft shadow-elevated ring-1 ring-border">
            This job runs via Inngest but does not yet write{" "}
            <code className="text-xs">agent_runs</code> rows. Execution path:{" "}
            <code className="text-xs">{entry.executionPath}</code>
            {entry.inngestId ? (
              <>
                {" "}
                · Inngest <code className="text-xs">{entry.inngestId}</code>
              </>
            ) : null}
          </p>
        ) : runs.length === 0 ? (
          <p className="rounded-lg bg-card p-5 text-sm text-ink-soft shadow-elevated ring-1 ring-border">
            No runs recorded yet for this agent.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-elevated ring-1 ring-border">
            {runs.map((run) => {
              const href = resolveRunOutputHref(entry, run);
              return (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusTone(run.status)}>{run.status}</Badge>
                      <span className="text-ink-soft">
                        {formatRelativeTime(run.created_at)}
                      </span>
                      <span className="tabular-nums text-ink-soft">
                        {formatCostPence(run.cost_pence ?? 0)}
                      </span>
                    </div>
                    {run.error ? (
                      <p className="truncate text-xs text-danger">{run.error}</p>
                    ) : null}
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="shrink-0 font-medium text-primary hover:underline"
                    >
                      Open output
                    </Link>
                  ) : (
                    <Link
                      href={entry.moduleHref}
                      className="shrink-0 text-ink-soft hover:text-primary"
                    >
                      Module
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
