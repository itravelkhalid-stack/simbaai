import { generateOptimisationRecommendations } from "@/lib/agents/ads/generate";
import { aggregateMetrics, formatPence } from "@/lib/ads/metrics";
import { parseAdsSettings } from "@/lib/ads/settings";
import { applyRecommendation } from "@/lib/ads/recommendations";
import { getBrandContext } from "@/lib/brand/context";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdCampaign,
  AdMetricDaily,
  AdRecommendationType,
} from "@/lib/types/ads";

async function primaryBrandId(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const { data } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data) return data.id;
  const { data: fallback } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  return fallback?.id ?? null;
}

export async function runDailyOptimisationForOrg(organizationId: string) {
  const supabase = createAdminClient();
  const brandId = await primaryBrandId(supabase, organizationId);
  if (!brandId) return { recommendations: 0 };

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
  if (list.length === 0) return { recommendations: 0 };

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
      input: { window_days: 7, campaigns: list.length },
      logs: [{ at: new Date().toISOString(), message: "Running daily optimisation" }],
      progress: 10,
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

  // Auto-apply only budget shifts within cap when org enables auto_optimise
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .single();
  const settings = parseAdsSettings(org?.settings as Record<string, unknown>);
  if (settings.auto_optimise) {
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
      } catch {
        // leave as failed / pending handled inside apply
      }
    }
  }

  return { recommendations: created };
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
