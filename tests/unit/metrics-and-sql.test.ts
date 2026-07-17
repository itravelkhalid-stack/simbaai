import { describe, expect, it } from "vitest";

import { aggregateMetrics } from "@/lib/ads/metric-math";
import { queryPlanSchema } from "@/lib/data/query-layer";

describe("metric rollups", () => {
  it("aggregates ad metrics and derived ratios", () => {
    const rows = [
      {
        spend_pence: 1000,
        impressions: 1000,
        clicks: 50,
        conversions: 2,
        revenue_pence: 5000,
      },
      {
        spend_pence: 500,
        impressions: 500,
        clicks: 10,
        conversions: 1,
        revenue_pence: 2000,
      },
    ];

    const agg = aggregateMetrics(rows);
    expect(agg.spend_pence).toBe(1500);
    expect(agg.impressions).toBe(1500);
    expect(agg.clicks).toBe(60);
    expect(agg.conversions).toBe(3);
    expect(agg.revenue_pence).toBe(7000);
    expect(agg.roas).toBeCloseTo(7000 / 1500);
  });
});

describe("analytics SQL whitelist", () => {
  it("accepts whitelisted query ids only", () => {
    const plan = queryPlanSchema.parse({
      query_id: "channel_roas",
      params: { from: "2026-01-01", to: "2026-01-31" },
    });
    expect(plan.query_id).toBe("channel_roas");
  });

  it("rejects freeform / unknown query ids (no SQL escape)", () => {
    expect(() =>
      queryPlanSchema.parse({
        query_id: "select * from organizations",
        params: {},
      }),
    ).toThrow();

    expect(() =>
      queryPlanSchema.parse({
        query_id: "drop_table",
        params: {},
      }),
    ).toThrow();
  });
});
