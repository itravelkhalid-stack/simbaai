import type { CmoApproveDecision } from "@/lib/agents/prompts/content/cmo-approve";

/**
 * Organic severity policy for autonomous CMO:
 * - Compliance fail is handled before brand-fit.
 * - WARN/PASS items may only park when brand_fit is truly "poor".
 * - Spurious parks (decision=park with strong/acceptable fit) are overridden.
 */
export function shouldParkForBrandFit(params: {
  decision: Pick<CmoApproveDecision, "decision" | "brand_fit">;
  complianceStatus: string;
}): boolean {
  if (params.decision.brand_fit === "poor") return true;
  if (params.complianceStatus === "fail") return true;
  // WARN/PASS + non-poor fit → never park
  return false;
}
