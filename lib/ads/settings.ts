export type AdsOrgSettingsResolved = {
  auto_optimise: boolean;
  max_daily_budget_change_pence: number;
  currency: string;
};

export function parseAdsSettings(
  settings: Record<string, unknown> | null | undefined,
): AdsOrgSettingsResolved {
  const ads =
    settings && typeof settings === "object" && "ads" in settings
      ? (settings.ads as Record<string, unknown>)
      : {};
  return {
    auto_optimise: Boolean(ads.auto_optimise),
    max_daily_budget_change_pence: Number(
      ads.max_daily_budget_change_pence ?? 5000,
    ),
    currency: String(ads.currency ?? "GBP"),
  };
}
