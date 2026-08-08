"use server";

import { revalidatePath } from "next/cache";
import {
  cmoApproveLaunchReview,
  ensureLaunchReview,
  runDeterministicLaunchChecks,
} from "@/lib/ads/launch-review";
import { runAdsPlanningPipeline } from "@/lib/ads/pipeline";
import { adsWritesEnabled } from "@/lib/ads/providers/types";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

export type PipelineActionResult = {
  error?: string;
  success?: string;
  stale?: boolean;
  mediaPlanId?: string;
  campaignId?: string;
  stoppedAt?: string;
};
export async function rerunLaunchReviewAction(formData: FormData) {
  const { active } = await requireActiveOrg();
  const campaignId = String(formData.get("campaignId") ?? "");
  if (!campaignId) throw new Error("campaignId required");
  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("id, brand_id")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!campaign) throw new Error("Campaign not found");
  const reviewId = await ensureLaunchReview({
    organizationId: active.organization_id,
    brandId: campaign.brand_id,
    campaignId,
  });
  await runDeterministicLaunchChecks({
    organizationId: active.organization_id,
    brandId: campaign.brand_id,
    campaignId,
    reviewId,
  });
  revalidatePath(`/ads/campaigns/${campaignId}`);
}

export async function cmoApproveCampaignAction(formData: FormData) {
  const { user, active } = await requireActiveOrg();
  if (active.role === "org_viewer") throw new Error("Viewers cannot approve");
  const campaignId = String(formData.get("campaignId") ?? "");
  const note = String(formData.get("note") ?? "") || null;
  await cmoApproveLaunchReview({
    organizationId: active.organization_id,
    campaignId,
    actorUserId: user.id,
    note,
  });
  revalidatePath(`/ads/campaigns/${campaignId}`);
  revalidatePath("/ads/approvals");
}

/**
 * Local planning pipeline (brief → plan → creatives → launch review).
 * Does NOT call Meta Graph — ADS_WRITES_* only matter at paused create later.
 */
export async function runFirstFlightPipelineAction(
  _prev: PipelineActionResult,
  formData: FormData,
): Promise<PipelineActionResult> {
  let stoppedAt = "auth";
  try {
    const { user, active } = await requireActiveOrg();
    if (active.role === "org_viewer") {
      return {
        error: "Viewers cannot run the ads pipeline.",
        stoppedAt,
      };
    }

    stoppedAt = "preflight";
    const brandId = String(formData.get("brandId") ?? "").trim();
    const directiveId = String(formData.get("directiveId") ?? "").trim() || undefined;
    const dailyPence = Number(formData.get("dailyBudgetPence") ?? 200);
    if (!brandId) {
      return { error: "brandId is required", stoppedAt };
    }
    if (!Number.isFinite(dailyPence) || dailyPence <= 0) {
      return { error: "dailyBudgetPence must be a positive amount", stoppedAt };
    }

    const supabase = await createClient();
    const { data: limitRows } = await supabase
      .from("org_ad_limits")
      .select("brand_id, writes_paused, max_daily_spend_pence, max_single_campaign_daily_budget_pence")
      .eq("organization_id", active.organization_id)
      .or(`brand_id.is.null,brand_id.eq.${brandId}`);

    const orgLimits =
      (limitRows ?? []).find((r) => r.brand_id == null) ?? null;
    const brandLimits =
      (limitRows ?? []).find((r) => r.brand_id === brandId) ?? null;

    if (!orgLimits) {
      return {
        error:
          "Organization hard limits are missing. Set them on Ads → Settings before running the pipeline.",
        stoppedAt,
      };
    }
    if (dailyPence > orgLimits.max_single_campaign_daily_budget_pence) {
      return {
        error: `Requested £${(dailyPence / 100).toFixed(2)}/day exceeds the per-campaign cap of £${(orgLimits.max_single_campaign_daily_budget_pence / 100).toFixed(2)}. Raise org_ad_limits or lower the run amount.`,
        stoppedAt,
      };
    }
    if (dailyPence > orgLimits.max_daily_spend_pence) {
      return {
        error: `Requested £${(dailyPence / 100).toFixed(2)}/day exceeds the org daily cap of £${(orgLimits.max_daily_spend_pence / 100).toFixed(2)}.`,
        stoppedAt,
      };
    }

    const pauseOn =
      orgLimits.writes_paused || Boolean(brandLimits?.writes_paused);
    const writesHint = adsWritesEnabled("meta")
      ? null
      : "Note: ADS_WRITES_ENABLED/ADS_WRITES_META are not true in this runtime — local plans still build, but Meta paused-create will be blocked later.";

    stoppedAt = "pipeline";
    const result = await runAdsPlanningPipeline({
      organizationId: active.organization_id,
      brandId,
      monthlyBudgetPence: Math.max(dailyPence * 30, dailyPence),
      currency: "GBP",
      directiveId,
      createdBy: user.id,
    });

    revalidatePath("/ads/campaigns");
    revalidatePath("/ads/plans");
    revalidatePath("/ads/directives");

    const campaignId = result.campaignIds[0];
    const pauseMsg = pauseOn
      ? " Master pause is ON — Meta Graph create stays blocked until you unpause in Settings."
      : "";
    const writesMsg = writesHint ? ` ${writesHint}` : "";

    return {
      success: `Pipeline complete: media plan + ${result.campaignIds.length} campaign draft(s) + launch review opened.${pauseMsg}${writesMsg}`,
      mediaPlanId: result.mediaPlanId,
      campaignId,
      stoppedAt: "complete",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Pipeline failed unexpectedly";
    return { error: message, stoppedAt };
  }
}
