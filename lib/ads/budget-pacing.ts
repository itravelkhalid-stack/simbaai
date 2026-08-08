import {
  platformDailyCapFromShare,
  resolvePlatformShares,
  type AdBudgetAllocationMode,
  type PlatformAllocationRow,
} from "@/lib/ads/budget-allocation";
import type { AdPlatform, MediaPlanPayload } from "@/lib/types/ads";

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
 * Combined daily ceiling for the brand: monthly/30 × (1+flex), then org hard cap.
 * This is the TOTAL across all platforms — never per-platform full pot.
 */
export function combinedDailyCeiling(params: {
  monthlyBudgetPence: number;
  orgMaxDailySpendPence?: number | null;
}) {
  const { max: paceMax } = dailyPaceBounds(params.monthlyBudgetPence);
  let ceiling = paceMax;
  if (
    params.orgMaxDailySpendPence != null &&
    params.orgMaxDailySpendPence > 0
  ) {
    ceiling = Math.min(ceiling, params.orgMaxDailySpendPence);
  }
  return ceiling;
}

/**
 * Re-allocate campaign daily budgets so they sum to the paced daily total,
 * respect allocation / platform_split hard constraints, and clamp into ±20%.
 * Hard-cap: never exceed orgMaxDailySpendPence (sum of dailies across platforms).
 */
export function applyBudgetPacingToPlan(params: {
  plan: MediaPlanPayload;
  monthlyBudgetPence: number;
  orgMaxDailySpendPence?: number | null;
  maxSingleCampaignDailyPence?: number | null;
  allocationMode?: AdBudgetAllocationMode;
  platformAllocations?: PlatformAllocationRow[];
}): MediaPlanPayload {
  const pool = combinedDailyCeiling({
    monthlyBudgetPence: params.monthlyBudgetPence,
    orgMaxDailySpendPence: params.orgMaxDailySpendPence,
  });
  const { max: flexMax } = dailyPaceBounds(params.monthlyBudgetPence);

  const campaigns = [...(params.plan.campaigns ?? [])];
  if (!campaigns.length) {
    return { ...params.plan, campaigns };
  }

  const platforms = [
    ...new Set(campaigns.map((c) => c.platform)),
  ] as AdPlatform[];

  const mode = params.allocationMode ?? "ai_allocates";
  const allocations = params.platformAllocations ?? [];

  // Prefer explicit allocation hard constraints; fall back to plan.platform_split as AI proposal
  const aiPct: Partial<Record<AdPlatform, number>> = {};
  for (const row of params.plan.platform_split ?? []) {
    aiPct[row.platform] = Number(row.budget_pct) || 0;
  }

  const shares = resolvePlatformShares({
    monthlyBudgetPence: params.monthlyBudgetPence,
    mode,
    allocations,
    platforms,
    aiPctByPlatform: aiPct,
  });
  const dailyByPlatform = new Map(
    shares.map((s) => {
      const cap = platformDailyCapFromShare({
        monthlySharePence: s.monthly_pence,
        flex: BUDGET_PACE_FLEX,
      });
      // Platform share of the combined pool (target), not exceeding flex max
      const shareOfPool = Math.min(
        cap.target,
        Math.round(pool * (s.pct / 100)),
      );
      return [s.platform, Math.max(0, shareOfPool)] as const;
    }),
  );

  // Weight campaigns within each platform
  const platformCampaignCounts = new Map<AdPlatform, number>();
  for (const c of campaigns) {
    platformCampaignCounts.set(
      c.platform,
      (platformCampaignCounts.get(c.platform) ?? 0) + 1,
    );
  }

  const paced = campaigns.map((c) => {
    const platformPool = dailyByPlatform.get(c.platform) ?? 0;
    const n = platformCampaignCounts.get(c.platform) ?? 1;
    let daily = Math.round(platformPool / n);
    const shareMax = Math.round(daily * (1 + BUDGET_PACE_FLEX));
    const shareMin = Math.round(daily * (1 - BUDGET_PACE_FLEX));
    daily = Math.max(shareMin, Math.min(shareMax, daily));
    if (
      params.maxSingleCampaignDailyPence != null &&
      params.maxSingleCampaignDailyPence > 0
    ) {
      daily = Math.min(daily, params.maxSingleCampaignDailyPence);
    }
    daily = Math.min(daily, flexMax, pool);
    return { ...c, daily_budget_pence: Math.max(0, daily) };
  });

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

  // Sync platform_split to resolved shares for transparency
  const platform_split = shares.map((s) => ({
    platform: s.platform,
    budget_pct: Math.round(s.pct * 10) / 10,
    rationale:
      s.locked
        ? `Hard ${s.source} allocation (manual constraint)`
        : s.source === "ai"
          ? "AI allocation within combined monthly pot"
          : "Even split of unconstrained pot remainder",
  }));

  return {
    ...params.plan,
    campaigns: paced,
    platform_split,
    summary: `${params.plan.summary ?? ""}\n\n[Budget pacing] Combined monthly pot £${(params.monthlyBudgetPence / 100).toFixed(0)} → ~£${(pool / 100).toFixed(2)}/day across all platforms (±${BUDGET_PACE_FLEX * 100}% flex; org caps applied; mode=${mode}).`.trim(),
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

export function assertCombinedDailyWithinPot(params: {
  dailyBudgetsPence: number[];
  monthlyBudgetPence: number;
  orgMaxDailySpendPence?: number | null;
}) {
  const sum = params.dailyBudgetsPence.reduce((s, n) => s + n, 0);
  const ceiling = combinedDailyCeiling({
    monthlyBudgetPence: params.monthlyBudgetPence,
    orgMaxDailySpendPence: params.orgMaxDailySpendPence,
  });
  if (sum > ceiling) {
    throw new Error(
      `Combined daily spend £${(sum / 100).toFixed(2)} exceeds combined pot pacing ceiling £${(ceiling / 100).toFixed(2)} (monthly/30 ±20% and org limits).`,
    );
  }
}
