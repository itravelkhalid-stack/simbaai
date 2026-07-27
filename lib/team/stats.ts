import "server-only";

import {
  AGENT_DEPARTMENTS,
  AGENT_REGISTRY,
  DEPARTMENT_META,
  agentNamesForEntry,
  type AgentDepartment,
  type AgentRegistryEntry,
} from "@/lib/agents/registry";
import { nextCronOccurrence } from "@/lib/agents/cron-next";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun } from "@/lib/types/database";

export type AgentLiveStats = {
  entry: AgentRegistryEntry;
  lastRun: AgentRun | null;
  runs7d: number;
  success7d: number;
  successRate7d: number | null;
  costPence7d: number;
  nextScheduledAt: string | null;
  failing: boolean;
};

export type DepartmentLiveStats = {
  department: AgentDepartment;
  label: string;
  blurb: string;
  agentCount: number;
  failingCount: number;
  runs7d: number;
  lastActivityAt: string | null;
};

export type OrgTeamHeaderStats = {
  totalAgents: number;
  runsToday: number;
  actionsToday: number;
  failingCount: number;
};

function startOfUtcDay(d = new Date()) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  ).toISOString();
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function loadOrgTeamHeaderStats(
  organizationId: string,
): Promise<OrgTeamHeaderStats> {
  const supabase = await createClient();
  const today = startOfUtcDay();
  const weekAgo = daysAgoIso(7);

  const [{ count: runsToday }, { data: weekRuns }, { count: actionsToday }] =
    await Promise.all([
      supabase
        .from("agent_runs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", today),
      supabase
        .from("agent_runs")
        .select("status, agent_name, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", weekAgo)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("meeting_actions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", today),
    ]);

  const failingNames = new Set<string>();
  const latestByName = new Map<string, { status: string; at: string }>();
  for (const row of weekRuns ?? []) {
    const name = row.agent_name as string;
    if (!latestByName.has(name)) {
      latestByName.set(name, {
        status: row.status as string,
        at: row.created_at as string,
      });
    }
  }
  for (const [name, latest] of latestByName) {
    if (latest.status === "failed") failingNames.add(name);
  }

  // Also count currently queued/running failures? Only failed last run.
  const tracked = new Set(
    AGENT_REGISTRY.flatMap((e) => e.agentNames).filter(Boolean),
  );
  let failingCount = 0;
  for (const name of failingNames) {
    if (tracked.has(name)) failingCount += 1;
  }

  return {
    totalAgents: AGENT_REGISTRY.length,
    runsToday: runsToday ?? 0,
    actionsToday: actionsToday ?? 0,
    failingCount,
  };
}

export async function loadDepartmentStats(
  organizationId: string,
): Promise<DepartmentLiveStats[]> {
  const supabase = await createClient();
  const weekAgo = daysAgoIso(7);
  const { data: weekRuns } = await supabase
    .from("agent_runs")
    .select("status, agent_name, created_at, module")
    .eq("organization_id", organizationId)
    .gte("created_at", weekAgo)
    .limit(3000);

  return AGENT_DEPARTMENTS.map((department) => {
    const agents = AGENT_REGISTRY.filter((a) => a.department === department);
    const names = new Set(agents.flatMap((a) => a.agentNames));
    const relevant = (weekRuns ?? []).filter((r) =>
      names.has(r.agent_name as string),
    );
    const latestByName = new Map<string, string>();
    let failingCount = 0;
    for (const r of relevant) {
      const name = r.agent_name as string;
      if (!latestByName.has(name)) {
        latestByName.set(name, r.status as string);
      }
    }
    for (const status of latestByName.values()) {
      if (status === "failed") failingCount += 1;
    }
    const lastActivityAt =
      relevant.length > 0
        ? (relevant[0].created_at as string)
        : null;

    return {
      department,
      label: DEPARTMENT_META[department].label,
      blurb: DEPARTMENT_META[department].blurb,
      agentCount: agents.length,
      failingCount,
      runs7d: relevant.length,
      lastActivityAt,
    };
  }).filter((d) => d.agentCount > 0);
}

export async function loadAgentLiveStats(
  organizationId: string,
  entries: AgentRegistryEntry[],
): Promise<AgentLiveStats[]> {
  const supabase = await createClient();
  const weekAgo = daysAgoIso(7);
  const allNames = [
    ...new Set(entries.flatMap((e) => agentNamesForEntry(e))),
  ];

  let runs: AgentRun[] = [];
  if (allNames.length > 0) {
    const { data } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("organization_id", organizationId)
      .in("agent_name", allNames)
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(2000);
    runs = (data ?? []) as AgentRun[];
  }

  // Also fetch absolute last run per name (may be older than 7d)
  const lastByName = new Map<string, AgentRun>();
  if (allNames.length > 0) {
    const { data: recent } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("organization_id", organizationId)
      .in("agent_name", allNames)
      .order("created_at", { ascending: false })
      .limit(500);
    for (const row of (recent ?? []) as AgentRun[]) {
      if (!lastByName.has(row.agent_name)) {
        lastByName.set(row.agent_name, row);
      }
    }
  }

  return entries.map((entry) => {
    const names = new Set(agentNamesForEntry(entry));
    const matched = runs.filter((r) => names.has(r.agent_name));
    const complete = matched.filter((r) => r.status === "complete").length;
    const runs7d = matched.length;
    let lastRun: AgentRun | null = null;
    for (const name of names) {
      const candidate = lastByName.get(name);
      if (
        candidate &&
        (!lastRun ||
          new Date(candidate.created_at) > new Date(lastRun.created_at))
      ) {
        lastRun = candidate;
      }
    }
    const next =
      entry.trigger.kind === "cron"
        ? nextCronOccurrence(entry.trigger.schedule)
        : null;

    return {
      entry,
      lastRun,
      runs7d,
      success7d: complete,
      successRate7d: runs7d > 0 ? complete / runs7d : null,
      costPence7d: matched.reduce((sum, r) => sum + (r.cost_pence ?? 0), 0),
      nextScheduledAt: next ? next.toISOString() : null,
      failing: lastRun?.status === "failed",
    };
  });
}

export async function loadRecentRunsForAgent(
  organizationId: string,
  entry: AgentRegistryEntry,
  limit = 25,
): Promise<AgentRun[]> {
  const names = agentNamesForEntry(entry);
  if (names.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("organization_id", organizationId)
    .in("agent_name", names)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as AgentRun[];
}

export function formatCostPence(pence: number): string {
  if (pence <= 0) return "£0.00";
  return `£${(pence / 100).toFixed(2)}`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
