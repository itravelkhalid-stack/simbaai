"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { generateMarketingPlan } from "@/lib/agents/planning/generate";
import { getBrandContext } from "@/lib/brand/context";
import { inngest } from "@/lib/inngest/client";
import { assertPlanAllows } from "@/lib/billing/plans";
import { requireActiveOrg } from "@/lib/org/require";
import { materializePlan } from "@/lib/planning/materialize";
import { createClient } from "@/lib/supabase/server";
import {
  PLAN_SECTIONS,
  type MarketingPlan,
  type MarketingPlanPeriod,
  type PlanDocument,
  type PlanSectionKey,
  type SectionApprovals,
} from "@/lib/types/planning";

export type PlanningActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify planning");
  }
  return ctx;
}

async function primaryBrandId(organizationId: string) {
  const supabase = await createClient();
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
  if (!fallback) throw new Error("No brand found");
  return fallback.id;
}

function defaultSectionApprovals(): SectionApprovals {
  return Object.fromEntries(PLAN_SECTIONS.map((s) => [s.key, false])) as SectionApprovals;
}

function quarterBounds(from = new Date()) {
  const year = from.getUTCFullYear();
  const q = Math.floor(from.getUTCMonth() / 3);
  const start = new Date(Date.UTC(year, q * 3, 1));
  const end = new Date(Date.UTC(year, q * 3 + 3, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export async function createPlanWithAi(
  _prev: PlanningActionResult,
  formData: FormData,
): Promise<PlanningActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");
    const goalBrief = String(formData.get("goalBrief") ?? "").trim();
    if (goalBrief.length < 15) return { error: "Describe the business goal in more detail" };

    const periodType = (String(formData.get("periodType") ?? "quarter") ||
      "quarter") as MarketingPlanPeriod;
    const budgetPence = formData.get("budget")
      ? Math.round(Number(formData.get("budget")) * 100)
      : null;
    const bounds = quarterBounds();
    const periodStart = String(formData.get("periodStart") ?? "") || bounds.start;
    const periodEnd = String(formData.get("periodEnd") ?? "") || bounds.end;

    const brandId = await primaryBrandId(active.organization_id);
    const brandContext = await getBrandContext(active.organization_id, brandId);
    const supabase = await createClient();

    const [{ data: research }, { data: adMetrics }, { data: emailStats }] =
      await Promise.all([
        supabase
          .from("research_documents")
          .select("section, content")
          .eq("organization_id", active.organization_id)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("ad_metrics_daily")
          .select("spend_pence, revenue_pence, conversions")
          .eq("organization_id", active.organization_id)
          .limit(100),
        supabase
          .from("email_campaigns")
          .select("stats, name")
          .eq("organization_id", active.organization_id)
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

    const { data: run } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: active.organization_id,
        module: "planning",
        agent_name: "marketing_planner",
        status: "running",
        input: { goalBrief, periodType, periodStart, periodEnd },
        logs: [{ at: new Date().toISOString(), message: "Generating marketing plan" }],
        progress: 10,
      })
      .select("id")
      .single();

    let generated;
    try {
      generated = await generateMarketingPlan({
        brandContext,
        goalBrief,
        periodType,
        periodStart,
        periodEnd,
        budgetPence,
        currency: "GBP",
        performanceMarkdown,
        researchMarkdown: (research ?? [])
          .map((d) => `### ${d.section}\n${String(d.content ?? "").slice(0, 1500)}`)
          .join("\n\n"),
      });
    } catch (err) {
      if (run) {
        await supabase
          .from("agent_runs")
          .update({
            status: "failed",
            progress: 100,
            error: err instanceof Error ? err.message : String(err),
          })
          .eq("id", run.id);
      }
      throw err;
    }

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

    const doc = generated.data as PlanDocument;
    const totalBudget =
      budgetPence ??
      doc.budget_split.reduce((s, b) => s + b.amount_pence, 0);

    const { data: plan, error } = await supabase
      .from("marketing_plans")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        title: `Plan: ${goalBrief.slice(0, 60)}`,
        goal_brief: goalBrief,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        objectives: doc.objectives,
        document: doc,
        section_approvals: defaultSectionApprovals(),
        status: "pending_approval",
        budget_pence: totalBudget,
        currency: "GBP",
        agent_run_id: run?.id ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !plan) return { error: error?.message ?? "Failed to save plan" };
    redirect(`/planning/plans/${plan.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function savePlanDocument(
  _prev: PlanningActionResult,
  formData: FormData,
): Promise<PlanningActionResult> {
  try {
    const { active } = await assertCanWrite();
    const planId = String(formData.get("planId") ?? "");
    const document = JSON.parse(
      String(formData.get("document") ?? "{}"),
    ) as PlanDocument;
    const title = String(formData.get("title") ?? "").trim();
    const supabase = await createClient();
    const { error } = await supabase
      .from("marketing_plans")
      .update({
        document,
        objectives: document.objectives ?? [],
        title: title || undefined,
      })
      .eq("id", planId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath(`/planning/plans/${planId}`);
    return { success: "Plan document saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export async function approvePlanSection(formData: FormData) {
  const { active } = await assertCanWrite();
  const planId = String(formData.get("planId") ?? "");
  const section = String(formData.get("section") ?? "") as PlanSectionKey;
  if (!PLAN_SECTIONS.some((s) => s.key === section)) {
    throw new Error("Unknown section");
  }
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("marketing_plans")
    .select("*")
    .eq("id", planId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!plan) throw new Error("Plan not found");

  const approvals = {
    ...((plan.section_approvals ?? {}) as SectionApprovals),
    [section]: true,
  };
  const allApproved = PLAN_SECTIONS.every((s) => approvals[s.key]);
  await supabase
    .from("marketing_plans")
    .update({
      section_approvals: approvals,
      status: allApproved ? "approved" : "partially_approved",
    })
    .eq("id", planId);

  revalidatePath(`/planning/plans/${planId}`);
}

export async function finalizePlanApproval(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const planId = String(formData.get("planId") ?? "");
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("marketing_plans")
    .select("*")
    .eq("id", planId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!plan) throw new Error("Plan not found");

  const approvals = (plan.section_approvals ?? {}) as SectionApprovals;
  const missing = PLAN_SECTIONS.filter((s) => !approvals[s.key]);
  if (missing.length) {
    throw new Error(
      `Approve all sections first (${missing.map((m) => m.label).join(", ")})`,
    );
  }

  await materializePlan({
    plan: plan as MarketingPlan,
    userId: user.id,
  });

  revalidatePath("/planning");
  revalidatePath(`/planning/plans/${planId}`);
  redirect(`/planning/plans/${planId}/timeline`);
}

export async function updateTaskStatus(formData: FormData) {
  const { active } = await assertCanWrite();
  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "");
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("campaign_tasks")
    .update({
      status: status as never,
      completed_at: status === "done" ? new Date().toISOString() : null,
    })
    .eq("id", taskId)
    .eq("organization_id", active.organization_id)
    .select("campaign_id")
    .single();
  if (task) revalidatePath(`/planning/campaigns/${task.campaign_id}`);
}

export async function runAiTaskNow(formData: FormData) {
  const taskId = String(formData.get("taskId") ?? "");
  const { active } = await assertCanWrite();
  await assertPlanAllows(active.organization_id, "ai_runs_month");
  await inngest.send({
    name: "planning/task.execute",
    data: { taskId },
  });
  const supabase = await createClient();
  const { data: task } = await supabase
    .from("campaign_tasks")
    .select("campaign_id")
    .eq("id", taskId)
    .single();
  if (task) revalidatePath(`/planning/campaigns/${task.campaign_id}`);
}

export async function markNotificationRead(formData: FormData) {
  const { user } = await requireActiveOrg();
  const id = String(formData.get("notificationId") ?? "");
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/planning");
}
