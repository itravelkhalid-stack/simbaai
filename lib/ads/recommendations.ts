import { adsWritesEnabled } from "@/lib/ads/providers/types";
import { getAdsProvider } from "@/lib/ads/providers";
import { decryptAdConnection } from "@/lib/ads/connections";
import { parseAdsSettings } from "@/lib/ads/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdCampaign,
  AdConnection,
  AdRecommendation,
} from "@/lib/types/ads";

export async function applyRecommendation(params: {
  recommendationId: string;
  organizationId: string;
  userId?: string | null;
  /** When true, enforce max daily budget change cap from org settings. */
  fromAutoOptimise?: boolean;
}) {
  const supabase = createAdminClient();
  const { data: rec } = await supabase
    .from("ad_recommendations")
    .select("*")
    .eq("id", params.recommendationId)
    .eq("organization_id", params.organizationId)
    .single();
  if (!rec) throw new Error("Recommendation not found");
  if (rec.status !== "pending") throw new Error("Recommendation already handled");

  const recommendation = rec as AdRecommendation;
  const payload = recommendation.payload ?? {};

  try {
    if (recommendation.recommendation_type === "pause_campaign") {
      await pauseCampaignFromPayload({
        organizationId: params.organizationId,
        campaignId: String(payload.campaign_id ?? recommendation.campaign_id ?? ""),
      });
    } else if (recommendation.recommendation_type === "shift_budget") {
      await shiftBudgetFromPayload({
        organizationId: params.organizationId,
        payload,
        fromAutoOptimise: params.fromAutoOptimise,
      });
    } else if (recommendation.recommendation_type === "activate_campaign") {
      await supabase
        .from("ad_campaigns")
        .update({ status: "active" })
        .eq("id", String(payload.campaign_id ?? recommendation.campaign_id ?? ""))
        .eq("organization_id", params.organizationId);
    } else if (recommendation.recommendation_type === "refresh_creative") {
      // Mark campaign as needing creative — no auto-upload
      await supabase
        .from("ad_campaigns")
        .update({
          last_error: "Creative refresh recommended — generate new variants in UI",
        })
        .eq("id", String(payload.campaign_id ?? recommendation.campaign_id ?? ""))
        .eq("organization_id", params.organizationId);
    }

    await supabase
      .from("ad_recommendations")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        applied_by: params.userId ?? null,
      })
      .eq("id", params.recommendationId);

    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Apply failed";
    await supabase
      .from("ad_recommendations")
      .update({ status: "failed", dismiss_reason: message })
      .eq("id", params.recommendationId);
    throw error;
  }
}

async function loadCampaignWithConnection(
  organizationId: string,
  campaignId: string,
) {
  const supabase = createAdminClient();
  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .single();
  if (!campaign) throw new Error("Campaign not found");
  let connection: AdConnection | null = null;
  if (campaign.connection_id) {
    const { data } = await supabase
      .from("ad_connections")
      .select("*")
      .eq("id", campaign.connection_id)
      .maybeSingle();
    connection = (data as AdConnection) ?? null;
  }
  return { campaign: campaign as AdCampaign, connection };
}

async function pauseCampaignFromPayload(params: {
  organizationId: string;
  campaignId: string;
}) {
  const { campaign, connection } = await loadCampaignWithConnection(
    params.organizationId,
    params.campaignId,
  );
  const supabase = createAdminClient();

  if (
    connection &&
    campaign.platform_campaign_id &&
    adsWritesEnabled(campaign.platform)
  ) {
    const provider = getAdsProvider(campaign.platform);
    const tokens = decryptAdConnection(connection);
    await provider.pauseCampaign({
      accessToken: tokens.accessToken,
      accountId: connection.account_id,
      platformCampaignId: campaign.platform_campaign_id,
    });
  } else if (campaign.platform_campaign_id && !adsWritesEnabled(campaign.platform)) {
    // Local pause still applied; remote write gated by ADS_WRITES_ENABLED
  }

  await supabase
    .from("ad_campaigns")
    .update({ status: "paused" })
    .eq("id", campaign.id);
}

async function shiftBudgetFromPayload(params: {
  organizationId: string;
  payload: Record<string, unknown>;
  fromAutoOptimise?: boolean;
}) {
  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", params.organizationId)
    .single();
  const settings = parseAdsSettings(org?.settings as Record<string, unknown>);

  const toId = String(params.payload.to_campaign_id ?? params.payload.campaign_id ?? "");
  const fromId = params.payload.from_campaign_id
    ? String(params.payload.from_campaign_id)
    : null;
  let amount = Number(params.payload.amount_pence ?? params.payload.daily_budget_pence ?? 0);

  if (params.fromAutoOptimise) {
    if (!settings.auto_optimise) {
      throw new Error("Auto-optimise is disabled for this organization");
    }
    amount = Math.min(Math.abs(amount), settings.max_daily_budget_change_pence);
  }

  const { campaign, connection } = await loadCampaignWithConnection(
    params.organizationId,
    toId,
  );
  const nextBudget = Math.max(0, Number(campaign.daily_budget_pence ?? 0) + amount);

  if (
    connection &&
    campaign.platform_campaign_id &&
    adsWritesEnabled(campaign.platform)
  ) {
    const provider = getAdsProvider(campaign.platform);
    const tokens = decryptAdConnection(connection);
    await provider.updateBudget({
      accessToken: tokens.accessToken,
      accountId: connection.account_id,
      platformCampaignId: campaign.platform_campaign_id,
      dailyBudgetPence: nextBudget,
      currency: campaign.currency,
    });
  }

  await supabase
    .from("ad_campaigns")
    .update({ daily_budget_pence: nextBudget })
    .eq("id", campaign.id);

  if (fromId && amount > 0) {
    const { campaign: fromCampaign } = await loadCampaignWithConnection(
      params.organizationId,
      fromId,
    );
    await supabase
      .from("ad_campaigns")
      .update({
        daily_budget_pence: Math.max(
          0,
          Number(fromCampaign.daily_budget_pence ?? 0) - amount,
        ),
      })
      .eq("id", fromId);
  }
}
