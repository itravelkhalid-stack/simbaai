import { describe, expect, it } from "vitest";

import {
  buildKpiActualsMap,
  computeCpaPounds,
  resolveKpiActualsFromMap,
} from "@/lib/reviews/kpi-actuals";
import type { BrandKpi } from "@/lib/types/reviews";

describe("computeCpaPounds", () => {
  it("divides spend by conversions into pounds", () => {
    // £10 spend / 2 conversions = £5
    expect(computeCpaPounds(1000, 2)).toBe(5);
  });

  it("returns 0 when there are no conversions", () => {
    expect(computeCpaPounds(5000, 0)).toBe(0);
  });
});

describe("buildKpiActualsMap", () => {
  it("includes cpa, followers, and crm_revenue with ad revenue fallback", () => {
    const map = buildKpiActualsMap({
      ad_spend_pence: 1000,
      ad_revenue_pence: 2500,
      ad_conversions: 2,
      email_opens: 10,
      seo_clicks: 5,
      content_engagements: 20,
      crm_revenue_pence: 0,
      ig_followers: 1200,
      fb_followers: 800,
    });
    expect(map.cpa).toBe(5);
    expect(map.roas).toBe(2.5);
    expect(map.crm_revenue).toBe(25); // fallback to ad revenue
    expect(map.ig_followers).toBe(1200);
    expect(map.fb_followers).toBe(800);
  });

  it("prefers crm orders over ad revenue when present", () => {
    const map = buildKpiActualsMap({
      ad_spend_pence: 1000,
      ad_revenue_pence: 2500,
      ad_conversions: 1,
      email_opens: 0,
      seo_clicks: 0,
      content_engagements: 0,
      crm_revenue_pence: 4000,
      ig_followers: 0,
      fb_followers: 0,
    });
    expect(map.crm_revenue).toBe(40);
  });
});

describe("resolveKpiActualsFromMap", () => {
  it("resolves suggested keys including cpa", () => {
    const kpis = [
      {
        id: "1",
        organization_id: "o",
        brand_id: "b",
        metric_key: "cpa",
        label: "CPA",
        target_value: 10,
        unit: "£",
        channel: "ads",
        is_north_star: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
      },
    ] as BrandKpi[];
    const resolved = resolveKpiActualsFromMap(kpis, {
      cpa: 5,
    });
    expect(resolved[0]?.actual).toBe(5);
    expect(resolved[0]?.vs_target_pct).toBe(50);
  });
});
