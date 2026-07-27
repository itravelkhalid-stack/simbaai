import type { OrgPlan } from "@/lib/types/database";
import type { PlanLimitKey } from "@/lib/types/finance";
import {
  formatPlanLimit,
  isUnlimitedLimit,
  PLAN_UNLIMITED,
} from "@/lib/types/finance";

// Re-export PLAN_UNLIMITED from finance — keep plan-limit-error free of cycles
export { PLAN_UNLIMITED, formatPlanLimit, isUnlimitedLimit };

export const ALL_ORG_PLANS: OrgPlan[] = [
  "free",
  "starter",
  "growth",
  "agency",
  "internal",
];

export function planLimitLabel(key: PlanLimitKey): string {
  if (key === "ai_runs_month") return "AI runs this month";
  if (key === "brands") return "brands";
  if (key === "connected_channels") return "connected channels";
  if (key === "team_members") return "team seats";
  return String(key).replaceAll("_", " ");
}

export class PlanLimitError extends Error {
  readonly code = "PLAN_LIMIT" as const;
  readonly plan: OrgPlan;
  readonly key: PlanLimitKey;
  readonly usage: number;
  readonly limit: number;
  readonly upgradeHref: string;

  constructor(params: {
    plan: OrgPlan;
    key: PlanLimitKey;
    usage: number;
    limit: number;
    planLabel: string;
  }) {
    const limitLabel = formatPlanLimit(params.limit);
    const resource = planLimitLabel(params.key);
    const usageLine = isUnlimitedLimit(params.limit)
      ? `${params.planLabel} has unlimited ${resource}.`
      : `You've used ${params.usage} of ${limitLabel} ${resource} on the ${params.planLabel} plan.`;
    const message = isUnlimitedLimit(params.limit)
      ? usageLine
      : `${usageLine} Upgrade your plan to continue.`;
    super(message);
    this.name = "PlanLimitError";
    this.plan = params.plan;
    this.key = params.key;
    this.usage = params.usage;
    this.limit = params.limit;
    this.upgradeHref = "/finance/billing";
  }
}

export function isPlanLimitError(error: unknown): error is PlanLimitError {
  return error instanceof PlanLimitError;
}

/** Serialize plan-limit errors for action results (keeps message + CTA href). */
export function planLimitActionFields(error: unknown): {
  error: string;
  upgradeHref?: string;
} | null {
  if (!isPlanLimitError(error)) return null;
  return { error: error.message, upgradeHref: error.upgradeHref };
}
