import { describe, expect, it } from "vitest";
import {
  resolvePlatformShares,
} from "@/lib/ads/budget-allocation";
import {
  applyBudgetPacingToPlan,
  assertCombinedDailyWithinPot,
  combinedDailyCeiling,
  dailyPaceBounds,
  dailyPacePence,
} from "@/lib/ads/budget-pacing";
import type { MediaPlanPayload } from "@/lib/types/ads";

describe("budget pacing", () => {
  it("computes monthly/30 with ±20% flex", () => {
    expect(dailyPacePence(300_000)).toBe(10_000);
    expect(dailyPaceBounds(300_000)).toEqual({
      target: 10_000,
      min: 8_000,
      max: 12_000,
    });
  });

  it("combined ceiling is min of pace max and org cap", () => {
    expect(
      combinedDailyCeiling({
        monthlyBudgetPence: 500_00, // £500 → ~£16.67/day, max ~£20
        orgMaxDailySpendPence: 200, // £2
      }),
    ).toBe(200);
  });

  it("reallocates campaign dailies within org cap across platforms", () => {
    const plan: MediaPlanPayload = {
      summary: "test",
      platform_split: [
        { platform: "meta", budget_pct: 60, rationale: "scale" },
        { platform: "google", budget_pct: 40, rationale: "intent" },
      ],
      funnel_stages: [],
      campaigns: [
        {
          name: "Meta",
          platform: "meta",
          objective: "conversions",
          daily_budget_pence: 50_000,
          funnel_stage: "conversion",
          audience: "broad",
          targeting_notes: "",
          creative_requirements: [],
        },
        {
          name: "Google",
          platform: "google",
          objective: "conversions",
          daily_budget_pence: 50_000,
          funnel_stage: "conversion",
          audience: "search",
          targeting_notes: "",
          creative_requirements: [],
        },
      ],
      creative_brief: "",
      risks: [],
    };
    const paced = applyBudgetPacingToPlan({
      plan,
      monthlyBudgetPence: 300_000,
      orgMaxDailySpendPence: 8_000,
      maxSingleCampaignDailyPence: 10_000,
      allocationMode: "ai_allocates",
    });
    const sum = (paced.campaigns ?? []).reduce(
      (s, c) => s + (c.daily_budget_pence ?? 0),
      0,
    );
    expect(sum).toBeLessThanOrEqual(8_000);
    expect(sum).toBeGreaterThan(0);
  });

  it("manual pct is a hard split of the combined pot", () => {
    const shares = resolvePlatformShares({
      monthlyBudgetPence: 100_000,
      mode: "manual_pct",
      allocations: [
        { platform: "meta", pct: 60 },
        { platform: "google", pct: 40 },
      ],
      platforms: ["meta", "google"],
    });
    expect(shares.find((s) => s.platform === "meta")?.monthly_pence).toBe(
      60_000,
    );
    expect(shares.find((s) => s.platform === "google")?.monthly_pence).toBe(
      40_000,
    );
  });

  it("rejects plan dailies that exceed combined pot ceiling", () => {
    expect(() =>
      assertCombinedDailyWithinPot({
        dailyBudgetsPence: [10_000, 10_000],
        monthlyBudgetPence: 300_000, // pace max 12_000
        orgMaxDailySpendPence: 50_000,
      }),
    ).toThrow(/Combined daily spend/);
  });

  it("never lets two platforms each take the full pot under AI even split", () => {
    const plan: MediaPlanPayload = {
      summary: "test",
      platform_split: [
        { platform: "meta", budget_pct: 100, rationale: "bad" },
        { platform: "google", budget_pct: 100, rationale: "also bad" },
      ],
      funnel_stages: [],
      campaigns: [
        {
          name: "Meta",
          platform: "meta",
          objective: "conversions",
          daily_budget_pence: 99_999,
          funnel_stage: "conversion",
          audience: "broad",
          targeting_notes: "",
          creative_requirements: [],
        },
        {
          name: "Google",
          platform: "google",
          objective: "conversions",
          daily_budget_pence: 99_999,
          funnel_stage: "conversion",
          audience: "search",
          targeting_notes: "",
          creative_requirements: [],
        },
      ],
      creative_brief: "",
      risks: [],
    };
    const paced = applyBudgetPacingToPlan({
      plan,
      monthlyBudgetPence: 30_000, // £300 → £10/day target, £12 max
      orgMaxDailySpendPence: null,
      allocationMode: "ai_allocates",
    });
    const sum = (paced.campaigns ?? []).reduce(
      (s, c) => s + (c.daily_budget_pence ?? 0),
      0,
    );
    expect(sum).toBeLessThanOrEqual(dailyPaceBounds(30_000).max);
  });
});
