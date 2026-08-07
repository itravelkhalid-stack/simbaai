import type { MediaPlanPayload } from "@/lib/types/ads";

/** Nominal days for monthly → daily pacing. */
export const BUDGET_PACE_DAYS = 30;
/** Agents may flex daily spend ±20% around monthly/30. */
export const BUDGET_PACE_FLEX = 0.2;

export function dailyPacePence(monthlyBudgetPence: number) {
  return Math.max(0, Math.round(monthlyBudgetPence / BUDGET_PACE_DAYS));
}

export function dailyPaceBounds(monthlyBudgetPence: number) {
  const target = dailyPacePence(monthlyBudgetPence);
  return {
    target,
    min: Math.round(target * (1 - BUDGET_PACE_FLEX)),
    max: Math.round(target * (1 + BUDGET_PACE_FLEX)),
  };
}

/**
 * Re-allocate campaign daily budgets so they sum to the paced daily total,
 * respect platform_split when present, and clamp each row into ±20% of its share.
 * Hard-cap: never exceed orgMaxDailySpendPence (sum of dailies).
 */
export function applyBudgetPacingToPlan(params: {
  plan: MediaPlanPayload;
  monthlyBudgetPence: number;
  orgMaxDailySpendPence?: number | null;
  maxSingleCampaignDailyPence?: number | null;
}): MediaPlanPayload {
  const { target, max: flexMax } = dailyPaceBounds(params.monthlyBudgetPence);
  let pool = target;
  if (
    params.orgMaxDailySpendPence != null &&
    params.orgMaxDailySpendPence > 0
  ) {
    pool = Math.min(pool, params.orgMaxDailySpendPence);
  }

  const campaigns = [...(params.plan.campaigns ?? [])];
  if (!campaigns.length) {
    return { ...params.plan, campaigns };
  }

  const split = params.plan.platform_split ?? [];
  const pctByPlatform = new Map(
    split.map((s) => [s.platform, Number(s.budget_pct) || 0]),
  );
  const weights = campaigns.map((c) => {
    const fromSplit = pctByPlatform.get(c.platform) ?? 0;
    if (fromSplit > 0) return fromSplit;
    return 1;
  });
  const weightSum = weights.reduce((s, w) => s + w, 0) || campaigns.length;

  const paced = campaigns.map((c, i) => {
    const share = pool * (weights[i]! / weightSum);
    const shareMax = Math.round(share * (1 + BUDGET_PACE_FLEX));
    const shareMin = Math.round(share * (1 - BUDGET_PACE_FLEX));
    let daily = Math.round(share);
    daily = Math.max(shareMin, Math.min(shareMax, daily));
    if (
      params.maxSingleCampaignDailyPence != null &&
      params.maxSingleCampaignDailyPence > 0
    ) {
      daily = Math.min(daily, params.maxSingleCampaignDailyPence);
    }
    // Also never exceed overall flex max for a single day of total pace
    daily = Math.min(daily, flexMax);
    return { ...c, daily_budget_pence: Math.max(0, daily) };
  });

  // If sum still over pool (rounding / caps), scale down proportionally
  let sum = paced.reduce((s, c) => s + (c.daily_budget_pence ?? 0), 0);
  if (sum > pool && sum > 0) {
    const scale = pool / sum;
    for (const c of paced) {
      c.daily_budget_pence = Math.max(
        0,
        Math.round((c.daily_budget_pence ?? 0) * scale),
      );
    }
    sum = paced.reduce((s, c) => s + (c.daily_budget_pence ?? 0), 0);
  }

  return {
    ...params.plan,
    campaigns: paced,
    summary: `${params.plan.summary ?? ""}\n\n[Budget pacing] Monthly £${(params.monthlyBudgetPence / 100).toFixed(0)} → ~£${(pool / 100).toFixed(2)}/day (±${BUDGET_PACE_FLEX * 100}% flex; org caps applied).`.trim(),
  };
}

export function assertDailyBudgetsWithinOrgCap(params: {
  dailyBudgetsPence: number[];
  orgMaxDailySpendPence: number;
}) {
  const sum = params.dailyBudgetsPence.reduce((s, n) => s + n, 0);
  if (sum > params.orgMaxDailySpendPence) {
    throw new Error(
      `Plan daily spend £${(sum / 100).toFixed(2)} exceeds org_ad_limits max daily £${(params.orgMaxDailySpendPence / 100).toFixed(2)}`,
    );
  }
}
