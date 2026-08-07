import { describe, expect, it } from "vitest";
import {
  applyBudgetPacingToPlan,
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

  it("reallocates campaign dailies within org cap", () => {
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
    });
    const sum = (paced.campaigns ?? []).reduce(
      (s, c) => s + (c.daily_budget_pence ?? 0),
      0,
    );
    expect(sum).toBeLessThanOrEqual(8_000);
    expect(sum).toBeGreaterThan(0);
  });
});
