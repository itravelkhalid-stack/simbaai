import { createAdminClient } from "@/lib/supabase/admin";
import { getBrandContext } from "@/lib/brand/context";
import { generateFinanceWeeklyAnalysis } from "@/lib/agents/finance/generate";
import {
  getBlendedMetrics,
  getBudgetVsActual,
  getCombinedAdPotActual,
} from "@/lib/finance/metrics";
import { platformToFinanceChannel } from "@/lib/types/finance";

function mondayOf(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  if (day !== 1) x.setUTCDate(x.getUTCDate() - (day - 1));
  return x.toISOString().slice(0, 10);
}

function monthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function priorMonthBounds(d = new Date()) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function runWeeklyFinanceAnalyst() {
  const supabase = createAdminClient();
  const weekStart = mondayOf();
  const month = monthBounds();
  const prior = priorMonthBounds();
  const { data: brands } = await supabase.from("brands").select("id, organization_id");
  const results: Array<{ brandId: string; summaryId: string }> = [];

  for (const brand of brands ?? []) {
    const { data: existing } = await supabase
      .from("finance_weekly_summaries")
      .select("id")
      .eq("brand_id", brand.id)
      .eq("week_start", weekStart)
      .maybeSingle();
    if (existing) continue;

    const [budgetActual, blended, priorBlended, combinedAdPot] = await Promise.all([
      getBudgetVsActual({
        organizationId: brand.organization_id,
        brandId: brand.id,
        periodStart: month.start,
        periodEnd: month.end,
      }),
      getBlendedMetrics({
        organizationId: brand.organization_id,
        brandId: brand.id,
        periodStart: month.start,
        periodEnd: month.end,
      }),
      getBlendedMetrics({
        organizationId: brand.organization_id,
        brandId: brand.id,
        periodStart: prior.start,
        periodEnd: prior.end,
      }),
      getCombinedAdPotActual({
        organizationId: brand.organization_id,
        brandId: brand.id,
      }),
    ]);

    if (
      blended.total_spend_pence === 0 &&
      blended.total_revenue_pence === 0 &&
      budgetActual.length === 0
    ) {
      continue;
    }

    const brandContext = await getBrandContext(brand.organization_id, brand.id, {
      admin: true,
    });

    const { data: agentRun } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: brand.organization_id,
        module: "finance",
        agent_name: "finance_analyst",
        status: "running",
        input: { brand_id: brand.id, week_start: weekStart },
        progress: 10,
      metered: false,
    })
    .select("id")
    .single();

  try {
      const generated = await generateFinanceWeeklyAnalysis({
        brandContext,
        periodLabel: `${month.start} → ${month.end}`,
        budgetActual,
        blended,
        priorBlended,
        combinedAdPot,
      });

      const { data: summary, error } = await supabase
        .from("finance_weekly_summaries")
        .insert({
          organization_id: brand.organization_id,
          brand_id: brand.id,
          week_start: weekStart,
          summary_markdown: generated.data.summary_markdown,
          alerts: generated.data.alerts,
          reallocation_suggestions: generated.data.reallocation_suggestions,
          agent_run_id: agentRun?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !summary) throw new Error(error?.message ?? "Insert failed");

      // Push reallocation suggestions into Ads recommendations feed
      for (const sug of generated.data.reallocation_suggestions) {
        const from = platformToFinanceChannel(sug.from_channel);
        const to = platformToFinanceChannel(sug.to_channel);
        await supabase.from("ad_recommendations").insert({
          organization_id: brand.organization_id,
          brand_id: brand.id,
          recommendation_type: "shift_budget",
          title: `Finance: shift £${(sug.amount_pence / 100).toFixed(0)} ${from} → ${to}`,
          rationale: sug.rationale,
          payload: {
            from_channel: from,
            to_channel: to,
            amount_pence: sug.amount_pence,
            source: "finance_analyst",
            week_start: weekStart,
          },
          status: "pending",
        });
      }

      if (agentRun?.id) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            output: {
              alerts: generated.data.alerts.length,
              suggestions: generated.data.reallocation_suggestions.length,
            },
            tokens_in: generated.tokensIn,
            tokens_out: generated.tokensOut,
            cost_pence: generated.costPence,
            progress: 100,
          })
          .eq("id", agentRun.id);
      }

      results.push({ brandId: brand.id, summaryId: summary.id });
    } catch (err) {
      if (agentRun?.id) {
        await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            error: err instanceof Error ? err.message : "failed",
            progress: 100,
          })
          .eq("id", agentRun.id);
      }
    }
  }

  return { weekStart, results };
}
