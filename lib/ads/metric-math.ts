import { deriveMetrics } from "@/lib/ads/providers/http";
import type { AdMetricDaily } from "@/lib/types/ads";

export function aggregateMetrics(
  rows: Array<
    Pick<
      AdMetricDaily,
      | "spend_pence"
      | "impressions"
      | "clicks"
      | "conversions"
      | "revenue_pence"
    >
  >,
) {
  const spend = rows.reduce((s, r) => s + r.spend_pence, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const conversions = rows.reduce((s, r) => s + Number(r.conversions), 0);
  const revenue = rows.reduce((s, r) => s + r.revenue_pence, 0);
  const derived = deriveMetrics({
    spendPence: spend,
    impressions,
    clicks,
    revenuePence: revenue,
  });
  return {
    spend_pence: spend,
    impressions,
    clicks,
    conversions,
    revenue_pence: revenue,
    ...derived,
  };
}
