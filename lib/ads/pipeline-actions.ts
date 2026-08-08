"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  cmoApproveLaunchReview,
  ensureLaunchReview,
  runDeterministicLaunchChecks,
} from "@/lib/ads/launch-review";
import { runAdsPlanningPipeline } from "@/lib/ads/pipeline";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";

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

export async function runFirstFlightPipelineAction(formData: FormData) {
  const { user, active } = await requireActiveOrg();
  if (active.role === "org_viewer") throw new Error("Viewers cannot run pipeline");
  const brandId = String(formData.get("brandId") ?? "");
  const directiveId = String(formData.get("directiveId") ?? "") || undefined;
  const dailyPence = Number(formData.get("dailyBudgetPence") ?? 200);
  // Monthly envelope for planner = daily * 30 (planner splits; first flight is £2/day)
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
  const firstCampaignId = result.campaignIds[0];
  if (firstCampaignId) {
    redirect(`/ads/campaigns/${firstCampaignId}`);
  }
  redirect("/ads/campaigns");
}
