import type { BrandKpi } from "@/lib/types/reviews";

export type KpiActualsInput = {
  ad_spend_pence: number;
  ad_revenue_pence: number;
  ad_conversions: number;
  email_opens: number;
  seo_clicks: number;
  content_engagements: number;
  crm_revenue_pence: number;
  /** Latest IG follower snapshot in the period (0 if none). */
  ig_followers: number;
  /** Latest FB Page follower snapshot in the period (0 if none). */
  fb_followers: number;
};

/** CPA in £ (major units). 0 when there are no conversions. */
export function computeCpaPounds(
  spendPence: number,
  conversions: number,
): number {
  if (conversions <= 0) return 0;
  return Math.round((spendPence / conversions / 100) * 100) / 100;
}

export function buildKpiActualsMap(input: KpiActualsInput): Record<string, number> {
  const spendMajor = input.ad_spend_pence / 100;
  const adRevenueMajor = input.ad_revenue_pence / 100;
  const crmMajor = input.crm_revenue_pence / 100;
  return {
    ad_spend: spendMajor,
    ad_revenue: adRevenueMajor,
    roas:
      input.ad_spend_pence > 0
        ? input.ad_revenue_pence / input.ad_spend_pence
        : 0,
    cpa: computeCpaPounds(input.ad_spend_pence, input.ad_conversions),
    email_opens: input.email_opens,
    seo_clicks: input.seo_clicks,
    content_engagements: input.content_engagements,
    // Match reports: CRM orders, falling back to attributed ad revenue.
    crm_revenue: crmMajor > 0 ? crmMajor : adRevenueMajor,
    ig_followers: input.ig_followers,
    fb_followers: input.fb_followers,
  };
}

export function resolveKpiActualsFromMap(
  kpis: BrandKpi[],
  actuals: Record<string, number>,
) {
  return kpis.map((kpi) => {
    const value = actuals[kpi.metric_key] ?? 0;
    return {
      ...kpi,
      actual: value,
      vs_target_pct:
        kpi.target_value === 0
          ? null
          : Math.round((value / Number(kpi.target_value)) * 1000) / 10,
    };
  });
}
