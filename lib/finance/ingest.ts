import { createAdminClient } from "@/lib/supabase/admin";
import {
  platformToFinanceChannel,
  type FinanceChannel,
} from "@/lib/types/finance";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Pull ad spend from ad_metrics_daily into expenses (idempotent by reference). */
export async function ingestAdSpendAsExpenses(daysBack = 7) {
  const supabase = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceDate = isoDate(since);

  const { data: metrics } = await supabase
    .from("ad_metrics_daily")
    .select("id, organization_id, campaign_id, metric_date, spend_pence, currency")
    .gte("metric_date", sinceDate)
    .gt("spend_pence", 0)
    .limit(5000);

  if (!(metrics ?? []).length) return { inserted: 0, skipped: 0 };

  const campaignIds = [...new Set((metrics ?? []).map((m) => m.campaign_id))];
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("id, brand_id, platform, name")
    .in("id", campaignIds);
  const campaignById = new Map((campaigns ?? []).map((c) => [c.id, c]));

  let inserted = 0;
  let skipped = 0;

  for (const m of metrics ?? []) {
    const campaign = campaignById.get(m.campaign_id);
    if (!campaign) {
      skipped += 1;
      continue;
    }
    const channel = platformToFinanceChannel(campaign.platform);
    const reference = `ad_metric:${m.id}`;
    const { error } = await supabase.from("expenses").upsert(
      {
        organization_id: m.organization_id,
        brand_id: campaign.brand_id,
        expense_date: m.metric_date,
        channel,
        description: `Ad spend · ${campaign.name} (${campaign.platform})`,
        amount_pence: m.spend_pence ?? 0,
        currency: m.currency ?? "GBP",
        source: "auto_ads",
        reference,
      },
      { onConflict: "brand_id,source,reference", ignoreDuplicates: false },
    );
    if (error) skipped += 1;
    else inserted += 1;
  }

  return { inserted, skipped };
}

/** Agent run AI costs as platform expenses (per org, aggregated daily). */
export async function ingestPlatformAiCosts(daysBack = 7) {
  const supabase = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);

  const { data: runs } = await supabase
    .from("agent_runs")
    .select("id, organization_id, cost_pence, created_at, module")
    .gte("created_at", since.toISOString())
    .gt("cost_pence", 0)
    .limit(5000);

  // Aggregate by org + day
  const buckets = new Map<
    string,
    { organizationId: string; date: string; amount: number }
  >();
  for (const r of runs ?? []) {
    const date = r.created_at.slice(0, 10);
    const key = `${r.organization_id}:${date}`;
    const cur = buckets.get(key) ?? {
      organizationId: r.organization_id,
      date,
      amount: 0,
    };
    cur.amount += r.cost_pence ?? 0;
    buckets.set(key, cur);
  }

  let inserted = 0;
  for (const b of buckets.values()) {
    const { data: brand } = await supabase
      .from("brands")
      .select("id")
      .eq("organization_id", b.organizationId)
      .eq("is_primary", true)
      .maybeSingle();
    const brandId =
      brand?.id ??
      (
        await supabase
          .from("brands")
          .select("id")
          .eq("organization_id", b.organizationId)
          .limit(1)
          .maybeSingle()
      ).data?.id;
    if (!brandId) continue;

    const reference = `ai_cost:${b.organizationId}:${b.date}`;
    const { error } = await supabase.from("expenses").upsert(
      {
        organization_id: b.organizationId,
        brand_id: brandId,
        expense_date: b.date,
        channel: "platform" as FinanceChannel,
        description: "AI agent run costs",
        amount_pence: b.amount,
        currency: "GBP",
        source: "auto_platform",
        reference,
      },
      { onConflict: "brand_id,source,reference" },
    );
    if (!error) inserted += 1;
  }

  return { inserted };
}

/** CRM orders + won deals → revenue_records */
export async function ingestCrmRevenue(daysBack = 30) {
  const supabase = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  const sinceIso = since.toISOString();

  let inserted = 0;

  const { data: orders } = await supabase
    .from("crm_orders")
    .select("*")
    .gte("ordered_at", sinceIso)
    .limit(2000);

  for (const o of orders ?? []) {
    const source =
      o.provider === "shopify"
        ? "shopify"
        : o.provider === "woocommerce"
          ? "woo"
          : "crm";
    const reference = `order:${o.provider}:${o.external_id}`;
    const { error } = await supabase.from("revenue_records").upsert(
      {
        organization_id: o.organization_id,
        brand_id: o.brand_id,
        revenue_date: o.ordered_at.slice(0, 10),
        source: source as "shopify" | "woo" | "crm",
        amount_pence: o.order_total_pence,
        currency: o.currency ?? "GBP",
        orders_count: 1,
        reference,
      },
      { onConflict: "brand_id,source,reference" },
    );
    if (!error) inserted += 1;
  }

  const { data: deals } = await supabase
    .from("crm_deals")
    .select("id, organization_id, brand_id, value_pence, won_at, name")
    .not("won_at", "is", null)
    .gte("won_at", sinceIso)
    .limit(1000);

  for (const d of deals ?? []) {
    if (!d.won_at) continue;
    const reference = `deal_won:${d.id}`;
    const { error } = await supabase.from("revenue_records").upsert(
      {
        organization_id: d.organization_id,
        brand_id: d.brand_id,
        revenue_date: d.won_at.slice(0, 10),
        source: "crm",
        amount_pence: d.value_pence ?? 0,
        currency: "GBP",
        orders_count: 1,
        reference,
        notes: d.name,
      },
      { onConflict: "brand_id,source,reference" },
    );
    if (!error) inserted += 1;
  }

  return { inserted };
}

export async function runDailyFinanceIngestion() {
  const ads = await ingestAdSpendAsExpenses(14);
  const platform = await ingestPlatformAiCosts(14);
  const revenue = await ingestCrmRevenue(45);
  return { ads, platform, revenue };
}
