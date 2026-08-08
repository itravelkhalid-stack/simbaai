import "server-only";

import {
  currentYearMonth,
  resolvePlatformShares,
  yearMonthLabel,
  type AdBudgetAllocationMode,
  type PlatformAllocationRow,
} from "@/lib/ads/budget-allocation";
import {
  combinedDailyCeiling,
  dailyPaceBounds,
  dailyPacePence,
} from "@/lib/ads/budget-pacing";
import { resolveMonthBudget } from "@/lib/ads/budget-schedule";
import { loadEffectiveOrgAdLimits } from "@/lib/ads/org-limits";
import type { AdPlatform, BrandBudgetMonth } from "@/lib/types/ads";
import { createClient } from "@/lib/supabase/server";

export type PlatformBudgetOverview = {
  platform: AdPlatform;
  allocated_monthly_pence: number;
  allocated_pct: number;
  locked: boolean;
  spend_to_date_pence: number;
  committed_daily_pence: number;
};

export type BrandBudgetOverview = {
  brandId: string;
  brandName: string;
  yearMonth: string;
  yearMonthLabel: string;
  potPence: number | null;
  currency: string;
  source: "schedule" | "default" | "none";
  allocationMode: AdBudgetAllocationMode;
  platformAllocations: PlatformAllocationRow[];
  pace: { target: number; min: number; max: number } | null;
  combinedDailyCeilingPence: number | null;
  orgMaxDailySpendPence: number | null;
  spendToDatePence: number;
  committedDailyPence: number;
  projectedMonthEndPence: number;
  pacingWouldExceed: boolean;
  platforms: PlatformBudgetOverview[];
  scheduleRows: BrandBudgetMonth[];
  defaultBudgetPence: number | null;
};

export async function loadBrandBudgetOverview(params: {
  organizationId: string;
  brandId: string;
  brandName: string;
  yearMonth?: string;
}): Promise<BrandBudgetOverview> {
  const yearMonth = params.yearMonth ?? currentYearMonth();
  const supabase = await createClient();

  const monthBudget = await resolveMonthBudget({
    organizationId: params.organizationId,
    brandId: params.brandId,
    yearMonth,
    supabase,
  });

  let orgMax: number | null = null;
  try {
    const limits = await loadEffectiveOrgAdLimits({
      organizationId: params.organizationId,
      brandId: params.brandId,
    });
    orgMax = limits.max_daily_spend_pence;
  } catch {
    orgMax = null;
  }

  const monthStart = `${yearMonth}-01`;
  const [y, m] = yearMonth.split("-").map(Number);
  const monthEndDate = new Date(Date.UTC(y!, m!, 0));
  const monthEnd = monthEndDate.toISOString().slice(0, 10);
  const dayOfMonth = Math.min(
    new Date().getUTCDate(),
    monthEndDate.getUTCDate(),
  );
  const daysInMonth = monthEndDate.getUTCDate();

  const [
    { data: campaigns },
    { data: metrics },
    { data: scheduleRows },
    { data: brand },
  ] = await Promise.all([
    supabase
      .from("ad_campaigns")
      .select("id, platform, status, daily_budget_pence, platform_campaign_id")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .in("status", ["active", "paused"]),
    supabase
      .from("ad_metrics_daily")
      .select("campaign_id, spend_pence")
      .eq("organization_id", params.organizationId)
      .gte("metric_date", monthStart)
      .lte("metric_date", monthEnd),
    supabase
      .from("brand_budget_months")
      .select("*")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .order("year_month", { ascending: true }),
    supabase
      .from("brands")
      .select("monthly_ad_budget_pence")
      .eq("id", params.brandId)
      .maybeSingle(),
  ]);

  const campaignList = campaigns ?? [];
  const campaignPlatform = new Map(
    campaignList.map((c) => [c.id, c.platform as AdPlatform]),
  );

  const spendByPlatform = new Map<AdPlatform, number>();
  let spendToDatePence = 0;
  for (const row of metrics ?? []) {
    const platform = campaignPlatform.get(row.campaign_id);
    const spend = Number(row.spend_pence ?? 0);
    spendToDatePence += spend;
    if (platform) {
      spendByPlatform.set(platform, (spendByPlatform.get(platform) ?? 0) + spend);
    }
  }

  const isCommitted = (c: {
    status: string;
    platform_campaign_id?: string | null;
  }) =>
    c.status === "active" ||
    (c.status === "paused" && Boolean(c.platform_campaign_id));

  let committedDailyPence = 0;
  const committedByPlatform = new Map<AdPlatform, number>();
  for (const c of campaignList) {
    if (!isCommitted(c)) continue;
    const daily = Number(c.daily_budget_pence ?? 0);
    committedDailyPence += daily;
    const p = c.platform as AdPlatform;
    committedByPlatform.set(p, (committedByPlatform.get(p) ?? 0) + daily);
  }

  const pot = monthBudget.budgetPence;
  const pace = pot != null ? dailyPaceBounds(pot) : null;
  const combinedDailyCeilingPence =
    pot != null
      ? combinedDailyCeiling({
          monthlyBudgetPence: pot,
          orgMaxDailySpendPence: orgMax,
        })
      : null;

  const projectedMonthEndPence =
    dayOfMonth > 0
      ? Math.round((spendToDatePence / dayOfMonth) * daysInMonth)
      : 0;
  const pacingWouldExceed =
    pot != null &&
    (projectedMonthEndPence > pot ||
      (combinedDailyCeilingPence != null &&
        committedDailyPence > combinedDailyCeilingPence));

  const platformsPresent = [
    ...new Set([
      ...campaignList.map((c) => c.platform as AdPlatform),
      ...monthBudget.platformAllocations.map((a) => a.platform as AdPlatform),
      "meta" as AdPlatform,
      "google" as AdPlatform,
    ]),
  ];

  const shares =
    pot != null && pot > 0
      ? resolvePlatformShares({
          monthlyBudgetPence: pot,
          mode: monthBudget.allocationMode,
          allocations: monthBudget.platformAllocations,
          platforms: platformsPresent,
        })
      : [];

  const platforms: PlatformBudgetOverview[] = platformsPresent.map(
    (platform) => {
      const share = shares.find((s) => s.platform === platform);
      return {
        platform,
        allocated_monthly_pence: share?.monthly_pence ?? 0,
        allocated_pct: share?.pct ?? 0,
        locked: share?.locked ?? false,
        spend_to_date_pence: spendByPlatform.get(platform) ?? 0,
        committed_daily_pence: committedByPlatform.get(platform) ?? 0,
      };
    },
  );

  return {
    brandId: params.brandId,
    brandName: params.brandName,
    yearMonth,
    yearMonthLabel: yearMonthLabel(yearMonth),
    potPence: pot,
    currency: monthBudget.currency,
    source: monthBudget.source,
    allocationMode: monthBudget.allocationMode,
    platformAllocations: monthBudget.platformAllocations,
    pace,
    combinedDailyCeilingPence,
    orgMaxDailySpendPence: orgMax,
    spendToDatePence,
    committedDailyPence,
    projectedMonthEndPence,
    pacingWouldExceed,
    platforms,
    scheduleRows: (scheduleRows ?? []) as BrandBudgetMonth[],
    defaultBudgetPence:
      (brand as { monthly_ad_budget_pence?: number | null } | null)
        ?.monthly_ad_budget_pence ?? null,
  };
}

export function formatPaceHint(overview: BrandBudgetOverview) {
  if (overview.potPence == null || !overview.pace) {
    return "No monthly pot set — ads stay idle until you set a schedule entry or default.";
  }
  return `Combined pot pacing ≈ £${(dailyPacePence(overview.potPence) / 100).toFixed(2)}/day (±20%: £${(overview.pace.min / 100).toFixed(2)}–£${(overview.pace.max / 100).toFixed(2)}), org ceiling £${((overview.orgMaxDailySpendPence ?? 0) / 100).toFixed(2)}.`;
}
