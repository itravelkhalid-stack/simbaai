import { generateOptimisationRecommendations } from "@/lib/agents/ads/generate";
import { aggregateMetrics, formatPence } from "@/lib/ads/metrics";
import { parseAdsSettings } from "@/lib/ads/settings";
import { applyRecommendation } from "@/lib/ads/recommendations";
import {
  effectiveAutonomyMode,
  parseBrandAutonomy,
} from "@/lib/autonomy/settings";
import { getBrandContext } from "@/lib/brand/context";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdCampaign,
  AdMetricDaily,
  AdRecommendationType,
} from "@/lib/types/ads";
import type { Brand } from "@/lib/types/research";
import type { BrandKpi } from "@/lib/types/reviews";

async function primaryBrand(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const { data } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data) return data as Brand;
  const { data: fallback } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  return (fallback as Brand | null) ?? null;
}

async function resolveKpiThresholds(
  supabase: ReturnType<typeof createAdminClient>,
  brand: Brand,
) {
  const autonomy = parseBrandAutonomy(brand);
  let minRoas = autonomy.minRoas;
  let maxCpaPence = autonomy.maxCpaPence;

  const { data: kpis } = await supabase
    .from("brand_kpis")
    .select("metric_key, target_value, unit")
    .eq("brand_id", brand.id)
    .in("metric_key", ["roas", "cpa", "ad_cpa"]);

  for (const kpi of (kpis ?? []) as Pick<
    BrandKpi,
    "metric_key" | "target_value" | "unit"
  >[]) {
    if (kpi.metric_key === "roas" && kpi.target_value > 0) {
      minRoas = kpi.target_value;
    }
    if (
      (kpi.metric_key === "cpa" || kpi.metric_key === "ad_cpa") &&
      kpi.target_value > 0
    ) {
      // Brand KPIs store money as major units when unit is £
      maxCpaPence =
        kpi.unit === "£" || kpi.unit === "gbp"
          ? Math.round(kpi.target_value * 100)
          : Math.round(kpi.target_value);
    }
  }
  return { minRoas, maxCpaPence };
}

function campaignCpaPence(agg: ReturnType<typeof aggregateMetrics>) {
  if (agg.conversions <= 0) return null;
  return Math.round(agg.spend_pence / agg.conversions);
}

/**
 * Insert KPI-driven pause recommendations for underperforming active campaigns.
 * Returns inserted recommendation ids.
 */
async function insertKpiPauseRecommendations(params: {
  organizationId: string;
  brandId: string;
  campaigns: AdCampaign[];
  metricsByCampaign: Map<string, AdMetricDaily[]>;
  minRoas: number;
  maxCpaPence: number;
  agentRunId: string | null;
}) {
  const supabase = createAdminClient();
  const ids: string[] = [];
  for (const campaign of params.campaigns) {
    if (campaign.status !== "active") continue;
    const agg = aggregateMetrics(
      params.metricsByCampaign.get(campaign.id) ?? [],
    );
    // Need meaningful spend before pausing on KPI
    if (agg.spend_pence < 100) continue;

    const cpa = campaignCpaPence(agg);
    const reasons: string[] = [];
    if (agg.roas > 0 && agg.roas < params.minRoas) {
      reasons.push(
        `ROAS ${agg.roas.toFixed(2)}x is below minimum ${params.minRoas}x`,
      );
    }
    if (cpa != null && cpa > params.maxCpaPence) {
      reasons.push(
        `CPA ${formatPence(cpa, campaign.currency)} exceeds max ${formatPence(params.maxCpaPence, campaign.currency)}`,
      );
    }
    // Zero conversions with material spend also triggers pause under ROAS rule
    if (agg.conversions <= 0 && agg.spend_pence >= 500 && params.minRoas > 0) {
      reasons.push(
        `No conversions with ${formatPence(agg.spend_pence, campaign.currency)} spend`,
      );
    }
    if (reasons.length === 0) continue;

    const { data, error } = await supabase
      .from("ad_recommendations")
      .insert({
        organization_id: params.organizationId,
        brand_id: params.brandId,
        campaign_id: campaign.id,
        recommendation_type: "pause_campaign" as AdRecommendationType,
        title: `Pause underperforming: ${campaign.name}`,
        rationale: reasons.join("; "),
        payload: {
          campaign_id: campaign.id,
          trigger: "kpi_threshold",
          min_roas: params.minRoas,
          max_cpa_pence: params.maxCpaPence,
          observed_roas: agg.roas,
          observed_cpa_pence: cpa,
        },
        status: "pending",
        agent_run_id: params.agentRunId,
      })
      .select("id")
      .single();
    if (!error && data) ids.push(data.id);
  }
  return ids;
}

export async function runDailyOptimisationForOrg(organizationId: string) {
  const supabase = createAdminClient();
  const brand = await primaryBrand(supabase, organizationId);
  if (!brand) return { recommendations: 0, executed: 0 };

  const brandId = brand.id;
  const autonomy = parseBrandAutonomy(brand);
  const adsMode = effectiveAutonomyMode(autonomy, "ads");
  const brandContext = await getBrandContext(organizationId, brandId, {
    admin: true,
  });
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", ["active", "paused", "approved"]);

  const list = (campaigns ?? []) as AdCampaign[];
  if (list.length === 0) return { recommendations: 0, executed: 0 };

  const { data: metrics } = await supabase
    .from("ad_metrics_daily")
    .select("*")
    .eq("organization_id", organizationId)
    .gte("metric_date", since.toISOString().slice(0, 10));

  const byCampaign = new Map<string, AdMetricDaily[]>();
  for (const row of (metrics ?? []) as AdMetricDaily[]) {
    const arr = byCampaign.get(row.campaign_id) ?? [];
    arr.push(row);
    byCampaign.set(row.campaign_id, arr);
  }

  const lines = list.map((c) => {
    const agg = aggregateMetrics(byCampaign.get(c.id) ?? []);
    return `- id=${c.id} | ${c.platform} | ${c.name} | status=${c.status} | daily_budget=${c.daily_budget_pence ?? 0}p | target_roas=${c.target_roas ?? "n/a"} | spend=${formatPence(agg.spend_pence, c.currency)} | roas=${agg.roas.toFixed(2)} | ctr=${(agg.ctr * 100).toFixed(2)}% | conversions=${agg.conversions.toFixed(1)}`;
  });

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: organizationId,
      module: "ads",
      agent_name: "ads_optimisation",
      status: "running",
      input: {
        window_days: 7,
        campaigns: list.length,
        autonomy_mode: adsMode,
        agent_activity_paused: autonomy.agentActivityPaused,
      },
      logs: [{ at: new Date().toISOString(), message: "Running daily optimisation" }],
      progress: 10,
      metered: false,
    })
    .select("id")
    .single();

  const generated = await generateOptimisationRecommendations({
    brandContext,
    performanceMarkdown: lines.join("\n"),
  });

  if (run) {
    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        output: generated.data,
        model: generated.model,
        tokens_in: generated.tokensIn,
        tokens_out: generated.tokensOut,
        cost_pence: generated.costPence,
        progress: 100,
      })
      .eq("id", run.id);
  }

  const nameToId = new Map(list.map((c) => [c.name.toLowerCase(), c.id]));
  let created = 0;
  for (const rec of generated.data.recommendations) {
    const campaignId =
      (rec.payload.campaign_id as string | undefined) ||
      (rec.campaign_name
        ? nameToId.get(rec.campaign_name.toLowerCase())
        : undefined) ||
      null;
    const payload = {
      ...rec.payload,
      campaign_id: campaignId ?? rec.payload.campaign_id,
    };
    const { error } = await supabase.from("ad_recommendations").insert({
      organization_id: organizationId,
      brand_id: brandId,
      campaign_id: campaignId,
      recommendation_type: rec.recommendation_type as AdRecommendationType,
      title: rec.title,
      rationale: rec.rationale,
      payload,
      status: "pending",
      agent_run_id: run?.id ?? null,
    });
    if (!error) created += 1;
  }

  const thresholds = await resolveKpiThresholds(supabase, brand);
  const kpiPauseIds = await insertKpiPauseRecommendations({
    organizationId,
    brandId,
    campaigns: list,
    metricsByCampaign: byCampaign,
    minRoas: thresholds.minRoas,
    maxCpaPence: thresholds.maxCpaPence,
    agentRunId: run?.id ?? null,
  });
  created += kpiPauseIds.length;

  let executed = 0;

  // Approval mode: recommendations feed only (no agent execution)
  if (adsMode !== "autonomous" || autonomy.agentActivityPaused) {
    return { recommendations: created, executed: 0 };
  }

  // Autonomous: execute KPI pauses first, then limited budget shifts
  for (const id of kpiPauseIds) {
    try {
      await applyRecommendation({
        recommendationId: id,
        organizationId,
        fromAutoOptimise: true,
      });
      executed += 1;
    } catch {
      // leave as failed / pending handled inside apply
    }
  }

  const { data: pendingPauses } = await supabase
    .from("ad_recommendations")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .eq("recommendation_type", "pause_campaign")
    .order("created_at", { ascending: false })
    .limit(5);
  for (const item of pendingPauses ?? []) {
    if (kpiPauseIds.includes(item.id)) continue;
    try {
      await applyRecommendation({
        recommendationId: item.id,
        organizationId,
        fromAutoOptimise: true,
      });
      executed += 1;
    } catch {
      // skip
    }
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .single();
  const settings = parseAdsSettings(org?.settings as Record<string, unknown>);
  // Budget shifts: autonomous brands may execute even without legacy auto_optimise,
  // but still respect the org max change when that setting is present.
  if (settings.auto_optimise || adsMode === "autonomous") {
    const { data: pending } = await supabase
      .from("ad_recommendations")
      .select("id, recommendation_type")
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .eq("recommendation_type", "shift_budget")
      .order("created_at", { ascending: false })
      .limit(3);
    for (const item of pending ?? []) {
      try {
        await applyRecommendation({
          recommendationId: item.id,
          organizationId,
          fromAutoOptimise: true,
        });
        executed += 1;
      } catch {
        // leave as failed / pending handled inside apply
      }
    }
  }

  return { recommendations: created, executed };
}

export async function runDailyOptimisationAllOrgs() {
  const supabase = createAdminClient();
  const { data: orgs } = await supabase.from("organizations").select("id").limit(100);
  const results = [];
  for (const org of orgs ?? []) {
    try {
      const result = await runDailyOptimisationForOrg(org.id);
      results.push({ organizationId: org.id, ...result, ok: true });
    } catch (error) {
      results.push({
        organizationId: org.id,
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}
