import "server-only";

import { generateMediaPlan } from "@/lib/agents/ads/generate";
import {
  applyBudgetPacingToPlan,
  assertCombinedDailyWithinPot,
  assertDailyBudgetsWithinOrgCap,
} from "@/lib/ads/budget-pacing";
import {
  addMonthsToYearMonth,
  currentYearMonth,
  yearMonthLabel,
} from "@/lib/ads/budget-allocation";
import { resolveMonthBudget } from "@/lib/ads/budget-schedule";
import { loadEffectiveOrgAdLimits } from "@/lib/ads/org-limits";
import {
  authorizeAgentAction,
  recordAutonomousAction,
} from "@/lib/autonomy/authorize";
import {
  effectiveAutonomyMode,
  parseBrandAutonomy,
} from "@/lib/autonomy/settings";
import { getBrandContext } from "@/lib/brand/context";
import { notifyApprovalsNeeded, notifyOrgAdmins } from "@/lib/notifications/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaPlanPayload } from "@/lib/types/ads";
import type { Brand } from "@/lib/types/research";

export async function runBrandBudgetAdsLoop(params: {
  organizationId: string;
  brandId: string;
  /** Force a new plan even if one is pending/approved this month. */
  force?: boolean;
}): Promise<{
  planId: string | null;
  mode: string;
  status: string;
  detail: string;
}> {
  const supabase = createAdminClient();
  const { data: brand, error } = await supabase
    .from("brands")
    .select("*")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .single();
  if (error || !brand) throw new Error(error?.message ?? "Brand not found");

  const brandRow = brand as Brand & {
    monthly_ad_budget_pence?: number | null;
    monthly_ad_budget_currency?: string;
  };

  if (brandRow.agent_activity_paused) {
    return {
      planId: null,
      mode: brandRow.autonomy_mode,
      status: "skipped",
      detail: "agent_activity_paused",
    };
  }

  const yearMonth = currentYearMonth();
  const monthBudget = await resolveMonthBudget({
    organizationId: params.organizationId,
    brandId: params.brandId,
    yearMonth,
    admin: true,
  });
  const monthly = monthBudget.budgetPence;
  if (monthly == null || monthly < 100) {
    return {
      planId: null,
      mode: brandRow.autonomy_mode,
      status: "skipped",
      detail: `No combined monthly ad pot for ${yearMonth} (schedule or default)`,
    };
  }

  const autonomy = parseBrandAutonomy(brandRow);
  const adsMode = effectiveAutonomyMode(autonomy, "ads");
  const currency = monthBudget.currency || brandRow.monthly_ad_budget_currency || "GBP";

  const nextMonth = await resolveMonthBudget({
    organizationId: params.organizationId,
    brandId: params.brandId,
    yearMonth: addMonthsToYearMonth(yearMonth, 1),
    admin: true,
  });
  const nextMonthHint =
    nextMonth.budgetPence != null
      ? `${yearMonthLabel(nextMonth.yearMonth)} budget is £${(nextMonth.budgetPence / 100).toFixed(0)} — structure pacing accordingly.`
      : `${yearMonthLabel(addMonthsToYearMonth(yearMonth, 1))} has no scheduled pot yet.`;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  if (!params.force) {
    const { data: existing } = await supabase
      .from("ad_media_plans")
      .select("id, status")
      .eq("brand_id", params.brandId)
      .eq("organization_id", params.organizationId)
      .gte("created_at", monthStart.toISOString())
      .in("status", ["pending_approval", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        planId: existing.id,
        mode: adsMode,
        status: "exists",
        detail: `Plan already ${existing.status} this month`,
      };
    }
  }

  const limits = await loadEffectiveOrgAdLimits({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });
  const brandContext = await getBrandContext(
    params.organizationId,
    params.brandId,
    { admin: true },
  );

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "ads",
      agent_name: "ads_budget_loop",
      status: "running",
      progress: 10,
      input: { brandId: params.brandId, monthly, currency, adsMode },
    })
    .select("id")
    .single();

  try {
    const allocationHint =
      monthBudget.allocationMode === "ai_allocates"
        ? `Allocation mode: AI allocates across platforms from the COMBINED pot. Respect any locked manual rows: ${JSON.stringify(monthBudget.platformAllocations)}.`
        : `Allocation mode: ${monthBudget.allocationMode} — treat platform allocations as HARD constraints: ${JSON.stringify(monthBudget.platformAllocations)}.`;

    const generated = await generateMediaPlan({
      brandContext,
      goalBrief: `Budget-only autonomy: the brand has a single COMBINED monthly ad pot of ${(monthly / 100).toFixed(0)} ${currency} covering ALL platforms (not per-platform). ${allocationHint} ${nextMonthHint} Human sets the pot + optional splits; never assign the full pot to each platform.`,
      monthlyBudgetPence: monthly,
      currency,
      targetRoas: brandRow.autonomy_min_roas ?? null,
      objective: "purchases",
      researchMarkdown: "",
    });

    let planPayload: MediaPlanPayload = {
      summary: generated.data.summary,
      platform_split: generated.data.platform_split,
      funnel_stages: generated.data.funnel_stages,
      campaigns: generated.data.campaigns,
      creative_brief: generated.data.creative_brief,
      risks: generated.data.risks,
    };

    planPayload = applyBudgetPacingToPlan({
      plan: planPayload,
      monthlyBudgetPence: monthly,
      orgMaxDailySpendPence: limits.max_daily_spend_pence,
      maxSingleCampaignDailyPence: limits.max_single_campaign_daily_budget_pence,
      allocationMode: monthBudget.allocationMode,
      platformAllocations: monthBudget.platformAllocations,
    });

    assertDailyBudgetsWithinOrgCap({
      dailyBudgetsPence: (planPayload.campaigns ?? []).map(
        (c) => c.daily_budget_pence ?? 0,
      ),
      orgMaxDailySpendPence: limits.max_daily_spend_pence,
    });
    assertCombinedDailyWithinPot({
      dailyBudgetsPence: (planPayload.campaigns ?? []).map(
        (c) => c.daily_budget_pence ?? 0,
      ),
      monthlyBudgetPence: monthly,
      orgMaxDailySpendPence: limits.max_daily_spend_pence,
    });

    const { data: plan, error: planErr } = await supabase
      .from("ad_media_plans")
      .insert({
        organization_id: params.organizationId,
        brand_id: params.brandId,
        name: generated.data.name ?? `${brandRow.name} budget plan`,
        goal_brief: "Budget-only autonomy (human monthly budget)",
        monthly_budget_pence: monthly,
        currency,
        target_roas: brandRow.autonomy_min_roas ?? null,
        objective: "purchases",
        plan: planPayload,
        status: "pending_approval",
        agent_run_id: run?.id ?? null,
      })
      .select("id")
      .single();
    if (planErr || !plan) throw new Error(planErr?.message ?? "plan insert failed");

    if (adsMode === "approval") {
      await notifyApprovalsNeeded({
        organizationId: params.organizationId,
        title: "Media plan awaiting approval (budget-only)",
        body: `${brandRow.name}: £${(monthly / 100).toFixed(0)}/mo plan ready`,
        link: `/ads/plans/${plan.id}`,
      });
      if (run) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            model: generated.model,
            tokens_in: generated.tokensIn,
            tokens_out: generated.tokensOut,
            cost_pence: generated.costPence,
            output: { planId: plan.id, mode: "approval" },
          })
          .eq("id", run.id);
      }
      return {
        planId: plan.id,
        mode: adsMode,
        status: "pending_approval",
        detail: "Plan created — human must approve, create paused, and go live",
      };
    }

    // Autonomous: CEO-approved plan → local campaigns → platform create where possible
    const authCreate = await authorizeAgentAction({
      organizationId: params.organizationId,
      brandId: params.brandId,
      channel: "ads",
      action: "ads_create_paused",
      agentName: "ads_budget_loop",
      entityType: "ad_media_plan",
      entityId: plan.id,
      summary: "Budget-only loop: create campaigns paused from plan",
    });
    if (!authCreate.mayExecute) {
      await notifyApprovalsNeeded({
        organizationId: params.organizationId,
        title: "Budget plan needs approval (autonomy blocked)",
        body: authCreate.reason,
        link: `/ads/plans/${plan.id}`,
      });
      if (run) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            output: { planId: plan.id, blocked: authCreate.reason },
          })
          .eq("id", run.id);
      }
      return {
        planId: plan.id,
        mode: adsMode,
        status: "queued",
        detail: authCreate.reason,
      };
    }

    const { data: connections } = await supabase
      .from("ad_connections")
      .select("id, platform")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("status", "active");
    const connectionByPlatform = new Map(
      (connections ?? []).map((c) => [c.platform, c.id]),
    );

    for (const spec of planPayload.campaigns ?? []) {
      await supabase.from("ad_campaigns").insert({
        organization_id: params.organizationId,
        brand_id: params.brandId,
        connection_id: connectionByPlatform.get(spec.platform) ?? null,
        media_plan_id: plan.id,
        platform: spec.platform,
        name: spec.name,
        objective: spec.objective,
        status: "approved",
        daily_budget_pence: spec.daily_budget_pence,
        currency,
        targeting: {
          audience: spec.audience,
          notes: spec.targeting_notes,
        },
        funnel_stage: spec.funnel_stage,
        target_roas: brandRow.autonomy_min_roas ?? null,
        is_managed: true,
      });
    }

    await supabase
      .from("ad_media_plans")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", plan.id);

    await recordAutonomousAction({
      organizationId: params.organizationId,
      brandId: params.brandId,
      action: "ads_create_paused",
      agentName: "ads_budget_loop",
      entityType: "ad_media_plan",
      entityId: plan.id,
      summary: "Approved budget-only media plan and created local campaigns",
      link: `/ads/plans/${plan.id}`,
    });

    // Best-effort platform create + activate (requires website + creatives + connection)
    let launched = 0;
    try {
      const { createPlanCampaignsPausedAsAgent } = await import(
        "@/lib/ads/launch-agent"
      );
      launched = await createPlanCampaignsPausedAsAgent({
        organizationId: params.organizationId,
        brandId: params.brandId,
        planId: plan.id,
      });
    } catch (err) {
      await notifyOrgAdmins({
        organizationId: params.organizationId,
        title: "Budget plan approved — platform create needs attention",
        body:
          err instanceof Error
            ? err.message
            : "Could not create campaigns on platform",
        link: `/ads/plans/${plan.id}`,
        category: "approvals",
      });
    }

    if (run) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          model: generated.model,
          tokens_in: generated.tokensIn,
          tokens_out: generated.tokensOut,
          cost_pence: generated.costPence,
          output: { planId: plan.id, mode: "autonomous", launched },
        })
        .eq("id", run.id);
    }

    return {
      planId: plan.id,
      mode: adsMode,
      status: "approved",
      detail: `Plan auto-approved; platform launched ${launched} campaign(s)`,
    };
  } catch (err) {
    if (run) {
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          progress: 100,
          error: err instanceof Error ? err.message : "budget loop failed",
        })
        .eq("id", run.id);
    }
    throw err;
  }
}

export async function runBudgetAdsLoopsForAllBrands() {
  const supabase = createAdminClient();
  const ym = currentYearMonth();
  const [{ data: withDefault }, { data: withSchedule }] = await Promise.all([
    supabase
      .from("brands")
      .select("id, organization_id")
      .eq("agent_activity_paused", false)
      .not("monthly_ad_budget_pence", "is", null)
      .gte("monthly_ad_budget_pence", 100)
      .limit(100),
    supabase
      .from("brand_budget_months")
      .select("brand_id, organization_id")
      .eq("year_month", ym)
      .gte("budget_pence", 100)
      .limit(100),
  ]);

  const brandMap = new Map<string, string>();
  for (const b of withDefault ?? []) {
    brandMap.set(b.id, b.organization_id);
  }
  for (const row of withSchedule ?? []) {
    brandMap.set(row.brand_id, row.organization_id);
  }

  const results = [];
  for (const [brandId, organizationId] of brandMap) {
    try {
      results.push({
        brandId,
        ...(await runBrandBudgetAdsLoop({ organizationId, brandId })),
      });
    } catch (err) {
      results.push({
        brandId,
        planId: null,
        mode: "?",
        status: "error",
        detail: err instanceof Error ? err.message : "failed",
      });
    }
  }
  return results;
}
