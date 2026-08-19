"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
    const supabase = await createClient();

    const { data: run, error: runErr } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: active.organization_id,
        module: "planning",
        agent_name: "marketing_planner",
        status: "queued",
        input: { goalBrief, periodType, periodStart, periodEnd, budgetPence },
        logs: [{ at: new Date().toISOString(), message: "Queued marketing plan generation" }],
        progress: 0,
      })
      .select("id")
      .single();
    if (runErr || !run) {
      return { error: runErr?.message ?? "Failed to queue planner run" };
    }

    const { data: plan, error: planErr } = await supabase
      .from("marketing_plans")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        title: `Generating: ${goalBrief.slice(0, 60)}`,
        goal_brief: goalBrief,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        objectives: [],
        document: { summary: "Generating…", objectives: [], strategies: [], campaigns: [], channel_tactics: [], budget_split: [], kpi_targets: [], task_breakdown: [] },
        section_approvals: defaultSectionApprovals(),
        status: "draft",
        budget_pence: budgetPence,
        currency: "GBP",
        agent_run_id: run.id,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (planErr || !plan) {
      return { error: planErr?.message ?? "Failed to create plan shell" };
    }

    await inngest.send({
      name: "planning/generate",
      data: {
        organizationId: active.organization_id,
        brandId,
        userId: user.id,
        planId: plan.id,
        agentRunId: run.id,
        goalBrief,
        periodType,
        periodStart,
        periodEnd,
        budgetPence,
      },
    });

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
