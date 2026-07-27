import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLAN_LIMITS,
  type PlanLimitKey,
  type PlanLimits,
} from "@/lib/types/finance";
import type { OrgPlan } from "@/lib/types/database";
import {
  formatPlanLimit,
  isUnlimitedLimit,
  PlanLimitError,
} from "@/lib/billing/plan-limit-error";

export type PlanLimitResult =
  | { ok: true; plan: OrgPlan; limits: PlanLimits; usage: number; limit: number }
  | {
      ok: false;
      plan: OrgPlan;
      limits: PlanLimits;
      usage: number;
      limit: number;
      message: string;
      upgradeHref: string;
    };

export {
  ALL_ORG_PLANS,
  formatPlanLimit,
  isUnlimitedLimit,
  PlanLimitError,
  isPlanLimitError,
  planLimitActionFields,
  PLAN_UNLIMITED,
} from "@/lib/billing/plan-limit-error";
export { isMeteredAgentName, UNMETERED_AGENT_NAMES } from "@/lib/billing/metering";

/** Pure plan-limit evaluation (unit-testable). */
export function evaluatePlanLimit(params: {
  plan: OrgPlan;
  key: PlanLimitKey;
  usage: number;
  increment?: number;
}): PlanLimitResult {
  const limits = PLAN_LIMITS[params.plan] ?? PLAN_LIMITS.free;
  const limit = limits[params.key];
  const next = params.usage + (params.increment ?? 0);

  if (!isUnlimitedLimit(limit) && next > limit) {
    const err = new PlanLimitError({
      plan: params.plan,
      key: params.key,
      usage: params.usage,
      limit,
      planLabel: limits.label,
    });
    return {
      ok: false,
      plan: params.plan,
      limits,
      usage: params.usage,
      limit,
      message: err.message,
      upgradeHref: err.upgradeHref,
    };
  }

  return {
    ok: true,
    plan: params.plan,
    limits,
    usage: params.usage,
    limit,
  };
}

function monthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return {
    startIso: start.toISOString(),
    endIso: new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
    ).toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

export async function getOrgPlan(organizationId: string): Promise<OrgPlan> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", organizationId)
    .single();
  return (data?.plan as OrgPlan) ?? "free";
}

export async function getPlanUsage(
  organizationId: string,
  key: PlanLimitKey,
): Promise<number> {
  const supabase = createAdminClient();
  const { startIso, endIso } = monthBounds();

  if (key === "brands") {
    const { count } = await supabase
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    return count ?? 0;
  }

  if (key === "ai_runs_month") {
    // Metered runs only; failed never count. See lib/billing/metering.ts.
    const { count } = await supabase
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("metered", true)
      .neq("status", "failed")
      .gte("created_at", startIso)
      .lt("created_at", endIso);
    return count ?? 0;
  }

  if (key === "connected_channels") {
    const [{ count: social }, { count: ads }, { count: seo }] = await Promise.all([
      supabase
        .from("social_connections")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("ad_connections")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("seo_projects")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("gsc_connected", true),
    ]);
    return (social ?? 0) + (ads ?? 0) + (seo ?? 0);
  }

  if (key === "team_members") {
    const { count } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active");
    return count ?? 0;
  }

  return 0;
}

export async function getAiSpendPenceThisMonth(organizationId: string) {
  const supabase = createAdminClient();
  const { startIso, endIso } = monthBounds();
  const { data } = await supabase
    .from("agent_runs")
    .select("cost_pence")
    .eq("organization_id", organizationId)
    .gte("created_at", startIso)
    .lt("created_at", endIso);
  return (data ?? []).reduce((s, r) => s + (r.cost_pence ?? 0), 0);
}

/**
 * Gate features by organization plan.
 * Example: `const check = await checkPlanLimit(orgId, "brands"); if (!check.ok) ...`
 */
export async function checkPlanLimit(
  organizationId: string,
  key: PlanLimitKey,
  options?: { increment?: number },
): Promise<PlanLimitResult> {
  const plan = await getOrgPlan(organizationId);
  const usage = await getPlanUsage(organizationId, key);
  return evaluatePlanLimit({
    plan,
    key,
    usage,
    increment: options?.increment,
  });
}

/** Throws PlanLimitError when the org would exceed the plan limit. */
export async function assertPlanAllows(
  organizationId: string,
  key: PlanLimitKey,
  options?: { increment?: number },
) {
  const result = await checkPlanLimit(organizationId, key, {
    increment: options?.increment ?? 1,
  });
  if (!result.ok) {
    throw new PlanLimitError({
      plan: result.plan,
      key,
      usage: result.usage,
      limit: result.limit,
      planLabel: result.limits.label,
    });
  }
  return result;
}

export async function getUsageSnapshot(organizationId: string) {
  const plan = await getOrgPlan(organizationId);
  const limits = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
  const [brands, ai_runs_month, connected_channels, team_members, ai_spend_pence] =
    await Promise.all([
      getPlanUsage(organizationId, "brands"),
      getPlanUsage(organizationId, "ai_runs_month"),
      getPlanUsage(organizationId, "connected_channels"),
      getPlanUsage(organizationId, "team_members"),
      getAiSpendPenceThisMonth(organizationId),
    ]);

  return {
    plan,
    limits,
    usage: { brands, ai_runs_month, connected_channels, team_members },
    ai_spend_pence,
  };
}

export function formatUsageQuota(usage: number, limit: number): string {
  return `${usage} / ${formatPlanLimit(limit)}`;
}
