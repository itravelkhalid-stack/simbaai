import { describe, expect, it } from "vitest";

import { evaluatePlanLimit } from "@/lib/billing/plans";
import { PLAN_LIMITS } from "@/lib/types/finance";

describe("plan limits", () => {
  it("allows usage under free brand limit", () => {
    const result = evaluatePlanLimit({
      plan: "free",
      key: "brands",
      usage: 0,
      increment: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.limit).toBe(PLAN_LIMITS.free.brands);
  });

  it("blocks exceeding free brand limit", () => {
    const result = evaluatePlanLimit({
      plan: "free",
      key: "brands",
      usage: 1,
      increment: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Free plan/);
    }
  });

  it("agency plan allows large AI run quotas", () => {
    const result = evaluatePlanLimit({
      plan: "agency",
      key: "ai_runs_month",
      usage: 5000,
      increment: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.limit).toBe(10_000);
  });
});
