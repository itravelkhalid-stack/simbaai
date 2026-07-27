import { describe, expect, it } from "vitest";

import { evaluatePlanLimit } from "@/lib/billing/plans";
import { PLAN_LIMITS, PLAN_UNLIMITED } from "@/lib/types/finance";

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

  it("blocks exceeding free brand limit with usage wording", () => {
    const result = evaluatePlanLimit({
      plan: "free",
      key: "brands",
      usage: 1,
      increment: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/You've used 1 of 1 brands/);
      expect(result.message).toMatch(/Free plan/);
      expect(result.upgradeHref).toBe("/finance/billing");
    }
  });

  it("blocks free AI runs with accurate usage", () => {
    const result = evaluatePlanLimit({
      plan: "free",
      key: "ai_runs_month",
      usage: 25,
      increment: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/You've used 25 of 25 AI runs this month/);
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

  it("internal plan never blocks AI runs", () => {
    const result = evaluatePlanLimit({
      plan: "internal",
      key: "ai_runs_month",
      usage: 50_000,
      increment: 1,
    });
    expect(result.ok).toBe(true);
    expect(result.limit).toBe(PLAN_UNLIMITED);
  });
});
