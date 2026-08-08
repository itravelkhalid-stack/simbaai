/** Meta Ads UK/EU-ish practical floor for ad-set daily budget (minor units). */
export const META_MIN_ADSET_DAILY_PENCE = 100; // £1.00

export type BudgetCampaignSpec = {
  name: string;
  funnel_stage: string;
  daily_budget_pence: number;
  platform?: string;
  objective?: string;
  audience?: string;
  targeting_notes?: string;
  creative_requirements?: string[];
};

/**
 * At tiny test budgets, Meta cannot host a multi-ad-set funnel under ~£1/ad set.
 * Collapse to a single campaign and raise each ad-set daily to the Meta floor
 * when the total daily envelope is below 2× the minimum.
 */
export function enforceMetaDailyBudgetShape<T extends BudgetCampaignSpec>(params: {
  campaigns: T[];
  /** Total daily envelope available for this run (e.g. £2 first flight). */
  totalDailyEnvelopePence: number;
  minAdSetDailyPence?: number;
}): { campaigns: T[]; consolidated: boolean; reason: string | null } {
  const min = params.minAdSetDailyPence ?? META_MIN_ADSET_DAILY_PENCE;
  const envelope = Math.max(0, Math.round(params.totalDailyEnvelopePence));
  let campaigns = [...params.campaigns];

  if (campaigns.length === 0) {
    return { campaigns, consolidated: false, reason: null };
  }

  const needSingle =
    campaigns.length > 1 &&
    envelope > 0 &&
    (envelope <= min * 2 || envelope < min * campaigns.length);

  if (needSingle) {
    const primary = [...campaigns].sort(
      (a, b) => (b.daily_budget_pence ?? 0) - (a.daily_budget_pence ?? 0),
    )[0];
    const daily = Math.max(min, envelope || min);
    campaigns = [
      {
        ...primary,
        daily_budget_pence: daily,
        funnel_stage: primary.funnel_stage || "Traffic",
        name: primary.name.replace(/\s*\|\s*Awareness\b/i, " | Traffic") || primary.name,
      },
    ];
    return {
      campaigns,
      consolidated: true,
      reason: `Meta minimum is ~£${(min / 100).toFixed(2)}/ad set/day. With £${(envelope / 100).toFixed(2)}/day total, only ONE ad set is allowed.`,
    };
  }

  campaigns = campaigns.map((c) => {
    const raw = Math.round(c.daily_budget_pence ?? 0);
    if (raw > 0 && raw < min) {
      if (campaigns.length === 1 && envelope >= min) {
        return { ...c, daily_budget_pence: Math.max(min, envelope) };
      }
      throw new Error(
        `Campaign "${c.name}" daily budget £${(raw / 100).toFixed(2)} is below Meta's ~£${(min / 100).toFixed(2)}/ad set minimum. Raise the budget or consolidate to fewer ad sets.`,
      );
    }
    if (raw === 0 && campaigns.length === 1 && envelope >= min) {
      return { ...c, daily_budget_pence: Math.max(min, envelope) };
    }
    return { ...c, daily_budget_pence: raw };
  });

  return { campaigns, consolidated: false, reason: null };
}

export function assertMetaCreateDailyBudget(dailyBudgetPence: number | null | undefined) {
  const daily = Math.round(Number(dailyBudgetPence ?? 0));
  if (!Number.isFinite(daily) || daily <= 0) {
    throw new Error("Set a positive daily budget before Meta create");
  }
  if (daily < META_MIN_ADSET_DAILY_PENCE) {
    throw new Error(
      `Daily budget £${(daily / 100).toFixed(2)} is below Meta's ~£${(META_MIN_ADSET_DAILY_PENCE / 100).toFixed(2)}/ad set minimum. Raise the campaign budget before create.`,
    );
  }
  return daily;
}
