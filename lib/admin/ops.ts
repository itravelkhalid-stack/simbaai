import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAiSpendPenceThisMonth,
  getOrgPlan,
  getPlanUsage,
} from "@/lib/billing/plans";
import { PLAN_LIMITS } from "@/lib/types/finance";
import type { Organization } from "@/lib/types/database";

export async function requirePlatformAdmin(userId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function listOrgsWithUsage() {
  const supabase = createAdminClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = [];
  for (const org of (orgs ?? []) as Organization[]) {
    const plan = await getOrgPlan(org.id);
    const limits = PLAN_LIMITS[plan];
    const [aiRuns, brands, members, spend] = await Promise.all([
      getPlanUsage(org.id, "ai_runs_month"),
      getPlanUsage(org.id, "brands"),
      getPlanUsage(org.id, "team_members"),
      getAiSpendPenceThisMonth(org.id),
    ]);
    rows.push({
      org,
      plan,
      limits,
      usage: {
        ai_runs_month: aiRuns,
        brands,
        team_members: members,
        ai_spend_pence: spend,
      },
    });
  }
  return rows;
}

export async function getAgentRunMonitor(days = 7) {
  const supabase = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("id, status, model, cost_pence, created_at, organization_id, module, error")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(2000);

  const list = runs ?? [];
  const total = list.length;
  const failed = list.filter((r) => r.status === "failed").length;
  const byModel = new Map<
    string,
    { runs: number; failed: number; cost_pence: number }
  >();
  for (const r of list) {
    const model = r.model || "unknown";
    const row = byModel.get(model) ?? { runs: 0, failed: 0, cost_pence: 0 };
    row.runs += 1;
    if (r.status === "failed") row.failed += 1;
    row.cost_pence += r.cost_pence ?? 0;
    byModel.set(model, row);
  }

  return {
    total,
    failed,
    errorRate: total ? Math.round((failed / total) * 1000) / 10 : 0,
    costPence: list.reduce((a, r) => a + (r.cost_pence ?? 0), 0),
    byModel: [...byModel.entries()]
      .map(([model, stats]) => ({ model, ...stats }))
      .sort((a, b) => b.cost_pence - a.cost_pence),
    recentFailures: list
      .filter((r) => r.status === "failed")
      .slice(0, 20),
  };
}
