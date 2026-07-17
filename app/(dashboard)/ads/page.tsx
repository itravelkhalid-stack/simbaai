import { AdsNav } from "@/components/ads/ads-nav";
import { MetricCards, SpendBars } from "@/components/ads/metrics-widgets";
import { aggregateMetrics } from "@/lib/ads/metrics";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdCampaign, AdMetricDaily, AdPlatform } from "@/lib/types/ads";
import { AD_PLATFORM_LABELS } from "@/lib/types/ads";
import Link from "next/link";

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

  const campaignMap = new Map(
    ((campaigns ?? []) as AdCampaign[]).map((c) => [c.id, c]),
  );

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ads</h1>
          <p className="mt-2 text-muted-foreground">
            Cross-platform spend and performance for {active.organization.name}.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {[7, 14, 30].map((d) => (
            <Link
              key={d}
              href={`/ads?days=${d}`}
              className={
                days === d ? "font-medium underline" : "text-muted-foreground"
              }
            >
              {d}d
            </Link>
          ))}
        </div>
      </div>
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
      />
      {spendDelta != null ? (
        <p className="text-sm text-muted-foreground">
          Spend vs prior {days}d: {spendDelta >= 0 ? "+" : ""}
          {spendDelta.toFixed(1)}%
        </p>
      ) : null}

      <div className="rounded-xl border p-4">
        <p className="mb-3 text-sm font-medium">Daily spend</p>
        <SpendBars days={daySeries} />
      </div>

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">By platform</div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="p-3">Platform</th>
              <th className="p-3">Spend</th>
              <th className="p-3">ROAS</th>
              <th className="p-3">CTR</th>
              <th className="p-3">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {[...platformSpend.entries()].map(([platform, rows]) => {
              const a = aggregateMetrics(rows);
              return (
                <tr key={platform} className="border-b">
                  <td className="p-3">{AD_PLATFORM_LABELS[platform]}</td>
                  <td className="p-3">
                    {(a.spend_pence / 100).toLocaleString("en-GB", {
                      style: "currency",
                      currency: "GBP",
                    })}
                  </td>
                  <td className="p-3">{a.roas.toFixed(2)}x</td>
                  <td className="p-3">{(a.ctr * 100).toFixed(2)}%</td>
                  <td className="p-3">{a.conversions.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Campaigns</div>
        <ul className="divide-y">
          {((campaigns ?? []) as AdCampaign[]).slice(0, 20).map((c) => {
            const a = aggregateMetrics(
              current.filter((m) => m.campaign_id === c.id),
            );
            return (
              <li key={c.id} className="flex justify-between gap-3 p-3 text-sm">
                <div>
                  <Link href={`/ads/campaigns/${c.id}`} className="font-medium underline">
                    {c.name}
                  </Link>
                  <p className="text-muted-foreground">
                    {AD_PLATFORM_LABELS[c.platform]} · {c.status}
                  </p>
                </div>
                <div className="text-right text-muted-foreground">
                  <p>
                    {(a.spend_pence / 100).toLocaleString("en-GB", {
                      style: "currency",
                      currency: c.currency,
                    })}
                  </p>
                  <p>ROAS {a.roas.toFixed(2)}x</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
