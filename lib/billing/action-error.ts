import { planLimitActionFields } from "@/lib/billing/plan-limit-error";

export type ActionErrorResult = {
  error: string;
  upgradeHref?: string;
};

/** Map thrown errors (including PlanLimitError) into action result fields. */
export function actionErrorFromUnknown(
  error: unknown,
  fallback = "Something went wrong",
): ActionErrorResult {
  const plan = planLimitActionFields(error);
  if (plan) return plan;
  return {
    error: error instanceof Error ? error.message : fallback,
  };
}

export type PlanAwareActionResult = {
  error?: string;
  upgradeHref?: string;
  success?: string;
};
