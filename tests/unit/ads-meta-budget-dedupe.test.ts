import { describe, expect, it } from "vitest";

import {
  destinationKey,
  funnelBucket,
} from "@/lib/ads/campaign-dedupe";
import {
  enforceMetaDailyBudgetShape,
  META_MIN_ADSET_DAILY_PENCE,
} from "@/lib/ads/meta-budget";

describe("enforceMetaDailyBudgetShape", () => {
  it("collapses multi-stage funnel when envelope is under 2× Meta minimum", () => {
    const result = enforceMetaDailyBudgetShape({
      campaigns: [
        {
          name: "Awareness",
          funnel_stage: "Awareness",
          daily_budget_pence: 70,
        },
        {
          name: "Consideration",
          funnel_stage: "Consideration",
          daily_budget_pence: 130,
        },
      ],
      totalDailyEnvelopePence: 200,
    });
    expect(result.consolidated).toBe(true);
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0]!.daily_budget_pence).toBe(200);
    expect(result.campaigns[0]!.daily_budget_pence).toBeGreaterThanOrEqual(
      META_MIN_ADSET_DAILY_PENCE,
    );
  });

  it("raises a single sub-minimum campaign up to the envelope", () => {
    const result = enforceMetaDailyBudgetShape({
      campaigns: [
        {
          name: "Tiny",
          funnel_stage: "Traffic",
          daily_budget_pence: 70,
        },
      ],
      totalDailyEnvelopePence: 200,
    });
    expect(result.campaigns).toHaveLength(1);
    expect(result.campaigns[0]!.daily_budget_pence).toBe(200);
  });

  it("errors when a campaign is below Meta minimum and cannot be raised alone", () => {
    expect(() =>
      enforceMetaDailyBudgetShape({
        campaigns: [
          {
            name: "A",
            funnel_stage: "Traffic",
            daily_budget_pence: 70,
          },
          {
            name: "B",
            funnel_stage: "Traffic",
            daily_budget_pence: 70,
          },
        ],
        // Envelope high enough for 2×min so we don't auto-collapse
        totalDailyEnvelopePence: 500,
      }),
    ).toThrow(/below Meta/i);
  });
});

describe("destinationKey / funnelBucket", () => {
  it("extracts dubai from names and slugs", () => {
    expect(destinationKey({ name: "Madyen | Dubai Hotels | Traffic" })).toBe(
      "dubai",
    );
    expect(destinationKey({ destinationSlug: "dubai" })).toBe("dubai");
    expect(destinationKey({ focusText: "hotels in Marmaris" })).toBe(
      "marmaris",
    );
  });

  it("buckets funnel stages", () => {
    expect(funnelBucket("Awareness & Inspiration")).toBe("awareness");
    expect(funnelBucket("Consideration & Intent")).toBe("consideration");
    expect(funnelBucket("Warm Retargeting")).toBe("retargeting");
  });
});
