import { AdsNav } from "@/components/ads/ads-nav";
import { CampaignsTable } from "@/components/ads/campaigns-table";
import { MetricCards, SpendBars } from "@/components/ads/metrics-widgets";
import { PageHeader } from "@/components/dashboard/page-header";
import { aggregateMetrics } from "@/lib/ads/metrics";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdCampaign, AdMetricDaily, AdPlatform } from "@/lib/types/ads";
import { AD_PLATFORM_LABELS } from "@/lib/types/ads";
import { formatPence } from "@/lib/ads/format";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default async function AdsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysRaw } = await searchParams;
  const days = Math.min(90, Math.max(7, Number(daysRaw ?? 14) || 14));
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const compareSince = new Date(since);
  compareSince.setDate(compareSince.getDate() - days);
  const compareSinceStr = compareSince.toISOString().slice(0, 10);
  const compareUntilStr = sinceStr;

  const [{ data: metrics }, { data: compareMetrics }, { data: campaigns }] =
    await Promise.all([
      supabase
        .from("ad_metrics_daily")
        .select("*")
        .eq("organization_id", active.organization_id)
        .gte("metric_date", sinceStr),
      supabase
        .from("ad_metrics_daily")
        .select("*")
        .eq("organization_id", active.organization_id)
        .gte("metric_date", compareSinceStr)
        .lt("metric_date", compareUntilStr),
      supabase
        .from("ad_campaigns")
        .select("*")
        .eq("organization_id", active.organization_id)
        .order("updated_at", { ascending: false }),
    ]);

  const current = (metrics ?? []) as AdMetricDaily[];
  const previous = (compareMetrics ?? []) as AdMetricDaily[];
  const agg = aggregateMetrics(current);
  const prevAgg = aggregateMetrics(previous);

  const byDay = new Map<string, number>();
  for (const row of current) {
    byDay.set(row.metric_date, (byDay.get(row.metric_date) ?? 0) + row.spend_pence);
  }
  const daySeries = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, spend_pence]) => ({ date, spend_pence }));

  const campaignList = (campaigns ?? []) as AdCampaign[];
  const campaignMap = new Map(campaignList.map((c) => [c.id, c]));

  const platformSpend = new Map<AdPlatform, AdMetricDaily[]>();
  for (const row of current) {
    const c = campaignMap.get(row.campaign_id);
    if (!c) continue;
    const arr = platformSpend.get(c.platform) ?? [];
    arr.push(row);
    platformSpend.set(c.platform, arr);
  }

  const spendDelta =
    prevAgg.spend_pence === 0
      ? null
      : ((agg.spend_pence - prevAgg.spend_pence) / prevAgg.spend_pence) * 100;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ads"
        description={
          <>
            Cross-platform spend and performance for {active.organization.name}.
          </>
        }
        actions={
          <div className="flex gap-2 text-sm">
            {[7, 14, 30].map((d) => (
              <Link
                key={d}
                href={`/ads?days=${d}`}
                className={cn(
                  "rounded-full px-3 py-1.5",
                  days === d
                    ? "bg-brand-soft font-medium text-primary"
                    : "text-ink-soft hover:bg-surface-soft",
                )}
              >
                {d}d
              </Link>
            ))}
          </div>
        }
      />
      <AdsNav current="/ads" />

      <MetricCards
        spend={agg.spend_pence}
        impressions={agg.impressions}
        clicks={agg.clicks}
        conversions={agg.conversions}
        roas={agg.roas}
        cpm={agg.cpm}
        cpc={agg.cpcPence}
        ctr={agg.ctr}
        spendDelta={spendDelta}
      />

      <div className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border">
        <p className="mb-3 font-heading text-sm font-semibold text-ink">
          Daily spend
        </p>
        <SpendBars days={daySeries} />
      </div>

      <div className="overflow-hidden rounded-lg bg-card shadow-elevated ring-1 ring-border">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold text-ink">
            By platform
          </h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-ink-soft">
              <th className="px-4 py-3 font-medium">Platform</th>
              <th className="px-4 py-3 font-medium">Spend</th>
              <th className="px-4 py-3 font-medium">ROAS</th>
              <th className="px-4 py-3 font-medium">CTR</th>
              <th className="px-4 py-3 font-medium">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {[...platformSpend.entries()].length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-ink-soft">
                  No platform spend in this range.
                </td>
              </tr>
            ) : (
              [...platformSpend.entries()].map(([platform, rows]) => {
                const a = aggregateMetrics(rows);
                return (
                  <tr key={platform} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      {AD_PLATFORM_LABELS[platform]}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatPence(a.spend_pence, "GBP")}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {a.roas.toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {(a.ctr * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {a.conversions.toFixed(1)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CampaignsTable
        campaigns={campaignList}
        metrics={current}
        days={days}
      />
    </div>
  );
}
