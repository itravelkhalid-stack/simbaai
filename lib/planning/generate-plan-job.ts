import "server-only";

import { generateMarketingPlan } from "@/lib/agents/planning/generate";
import { getBrandContext } from "@/lib/brand/context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PLAN_SECTIONS,
  type PlanDocument,
  type MarketingPlanPeriod,
  type SectionApprovals,
} from "@/lib/types/planning";

function defaultSectionApprovals(): SectionApprovals {
  return Object.fromEntries(
    PLAN_SECTIONS.map((s) => [s.key, false]),
  ) as SectionApprovals;
}

export async function runMarketingPlanGeneration(params: {
  organizationId: string;
  brandId: string;
  userId: string;
  planId: string;
  agentRunId: string;
  goalBrief: string;
  periodType: MarketingPlanPeriod;
  periodStart: string;
  periodEnd: string;
  budgetPence: number | null;
}) {
  const supabase = createAdminClient();

  const { assertBrandAgentsActive } = await import("@/lib/brand/agent-halt");
  await assertBrandAgentsActive({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });

  const brandContext = await getBrandContext(
    params.organizationId,
    params.brandId,
    { admin: true },
  );

  const [{ data: research }, { data: adMetrics }, { data: emailStats }] =
    await Promise.all([
      supabase
        .from("research_documents")
        .select("section, content")
        .eq("organization_id", params.organizationId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("ad_metrics_daily")
        .select("spend_pence, revenue_pence, conversions")
        .eq("organization_id", params.organizationId)
        .limit(100),
      supabase
        .from("email_campaigns")
        .select("stats, name")
        .eq("organization_id", params.organizationId)
        .limit(10),
    ]);

  const spend = (adMetrics ?? []).reduce((s, r) => s + (r.spend_pence ?? 0), 0);
  const revenue = (adMetrics ?? []).reduce(
    (s, r) => s + (r.revenue_pence ?? 0),
    0,
  );
  const performanceMarkdown = `
Ad spend (sample): £${(spend / 100).toFixed(0)}
Ad revenue (sample): £${(revenue / 100).toFixed(0)}
Email campaigns: ${(emailStats ?? []).length}
`.trim();

  try {
    await supabase
      .from("agent_runs")
      .update({
        status: "running",
        progress: 10,
        logs: [{ at: new Date().toISOString(), message: "Generating marketing plan" }],
      })
      .eq("id", params.agentRunId);

    const generated = await generateMarketingPlan({
      brandContext,
      goalBrief: params.goalBrief,
      periodType: params.periodType,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      budgetPence: params.budgetPence,
      currency: "GBP",
      performanceMarkdown,
      researchMarkdown: (research ?? [])
        .map((d) => `### ${d.section}\n${String(d.content ?? "").slice(0, 1500)}`)
        .join("\n\n"),
    });

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
        error: null,
      })
      .eq("id", params.agentRunId);

    const doc = generated.data as PlanDocument;
    const totalBudget =
      params.budgetPence ??
      doc.budget_split.reduce((s, b) => s + b.amount_pence, 0);

    const { error } = await supabase
      .from("marketing_plans")
      .update({
        title: `Plan: ${params.goalBrief.slice(0, 60)}`,
        goal_brief: params.goalBrief,
        period_type: params.periodType,
        period_start: params.periodStart,
        period_end: params.periodEnd,
        objectives: doc.objectives,
        document: doc,
        section_approvals: defaultSectionApprovals(),
        status: "pending_approval",
        budget_pence: totalBudget,
        currency: "GBP",
        agent_run_id: params.agentRunId,
        created_by: params.userId,
      })
      .eq("id", params.planId)
      .eq("organization_id", params.organizationId);

    if (error) throw new Error(error.message);
    return { planId: params.planId, ok: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("agent_runs")
      .update({ status: "failed", progress: 100, error: message })
      .eq("id", params.agentRunId);
    await supabase
      .from("marketing_plans")
      .update({ status: "archived" })
      .eq("id", params.planId)
      .eq("organization_id", params.organizationId);
    throw err;
  }
}
