import { adsWritesEnabled } from "@/lib/ads/providers/types";
import { getAdsProvider } from "@/lib/ads/providers";
import { ensureFreshAdAccessToken } from "@/lib/ads/connections";
import { parseAdsSettings } from "@/lib/ads/settings";
import { auditAdWrite, authorizeAdWrite } from "@/lib/ads/write-safety";
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
        userId: params.userId,
        fromAgent: params.fromAutoOptimise,
      });
    } else if (recommendation.recommendation_type === "shift_budget") {
      await shiftBudgetFromPayload({
        organizationId: params.organizationId,
        payload,
        fromAutoOptimise: params.fromAutoOptimise,
        userId: params.userId,
      });
    } else if (recommendation.recommendation_type === "activate_campaign") {
      await activateCampaignFromPayload({
        organizationId: params.organizationId,
        campaignId: String(
          payload.campaign_id ?? recommendation.campaign_id ?? "",
        ),
        userId: params.userId,
      });
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
  userId?: string | null;
  fromAgent?: boolean;
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
    await authorizeAdWrite({
      organizationId: params.organizationId,
      brandId: campaign.brand_id,
      platform: campaign.platform,
      action: "pause",
      campaignId: campaign.id,
      actorUserId: params.userId,
      actorName: params.fromAgent ? "ads_optimisation_agent" : null,
      currentDailyBudgetPence: campaign.daily_budget_pence,
    });
    const provider = getAdsProvider(campaign.platform);
    const { accessToken, connection: fresh } =
      await ensureFreshAdAccessToken(connection);
    await provider.pauseCampaign({
      accessToken,
      accountId: fresh.account_id,
      platformCampaignId: campaign.platform_campaign_id,
      metadata: {
        ...(fresh.metadata ?? {}),
        ...(campaign.platform_metadata ?? {}),
        platform_adset_id: campaign.platform_adset_id,
        platform_ad_id: campaign.platform_ad_id,
      },
    });
  } else if (campaign.platform_campaign_id && !adsWritesEnabled(campaign.platform)) {
    // Local pause still applied; remote write gated by ADS_WRITES_ENABLED
  }

  await supabase
    .from("ad_campaigns")
    .update({ status: "paused" })
    .eq("id", campaign.id);
  await auditAdWrite({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    actorName: params.fromAgent ? "ads_optimisation_agent" : null,
    campaign,
    action: "ad_campaign_pause_recommendation",
    before: { status: campaign.status },
    after: { status: "paused" },
  });
}

async function activateCampaignFromPayload(params: {
  organizationId: string;
  campaignId: string;
  userId?: string | null;
}) {
  const { campaign, connection } = await loadCampaignWithConnection(
    params.organizationId,
    params.campaignId,
  );
  if (!connection || !campaign.platform_campaign_id) {
    throw new Error("Remote campaign and active connection are required");
  }
  await authorizeAdWrite({
    organizationId: params.organizationId,
    brandId: campaign.brand_id,
    platform: campaign.platform,
    action: "activate",
    campaignId: campaign.id,
    actorUserId: params.userId,
    proposedDailyBudgetPence: campaign.daily_budget_pence,
  });
  const { accessToken, connection: fresh } =
    await ensureFreshAdAccessToken(connection);
  await getAdsProvider(campaign.platform).setCampaignStatus({
    accessToken,
    accountId: fresh.account_id,
    platformCampaignId: campaign.platform_campaign_id,
    status: "active",
    metadata: {
      ...(fresh.metadata ?? {}),
      ...(campaign.platform_metadata ?? {}),
      platform_adset_id: campaign.platform_adset_id,
      platform_ad_id: campaign.platform_ad_id,
      platform_budget_id: campaign.platform_budget_id,
    },
  });
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  await supabase
    .from("ad_campaigns")
    .update({
      status: "active",
      launch_approved_by: params.userId ?? null,
      launch_approved_at: now,
    })
    .eq("id", campaign.id);
  await auditAdWrite({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    campaign,
    action: "ad_campaign_activate_recommendation",
    before: { status: campaign.status },
    after: { status: "active", launch_approved_at: now },
  });
}

async function shiftBudgetFromPayload(params: {
  organizationId: string;
  payload: Record<string, unknown>;
  fromAutoOptimise?: boolean;
  userId?: string | null;
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
    await authorizeAdWrite({
      organizationId: params.organizationId,
      brandId: campaign.brand_id,
      platform: campaign.platform,
      action: "budget_update",
      campaignId: campaign.id,
      actorUserId: params.userId,
      actorName: params.fromAutoOptimise
        ? "ads_optimisation_agent"
        : null,
      currentDailyBudgetPence: campaign.daily_budget_pence,
      proposedDailyBudgetPence: nextBudget,
    });
    const provider = getAdsProvider(campaign.platform);
    const { accessToken, connection: fresh } =
      await ensureFreshAdAccessToken(connection);
    await provider.updateBudget({
      accessToken,
      accountId: fresh.account_id,
      platformCampaignId: campaign.platform_campaign_id,
      dailyBudgetPence: nextBudget,
      currency: campaign.currency,
      metadata: {
        ...(fresh.metadata ?? {}),
        ...(campaign.platform_metadata ?? {}),
        platform_adset_id: campaign.platform_adset_id,
        platform_budget_id: campaign.platform_budget_id,
      },
    });
  }

  await supabase
    .from("ad_campaigns")
    .update({ daily_budget_pence: nextBudget })
    .eq("id", campaign.id);
  await auditAdWrite({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    actorName: params.fromAutoOptimise ? "ads_optimisation_agent" : null,
    campaign,
    action: "ad_campaign_budget_recommendation",
    before: { daily_budget_pence: campaign.daily_budget_pence },
    after: { daily_budget_pence: nextBudget },
  });

  if (fromId && amount > 0) {
    const { campaign: fromCampaign, connection: fromConnection } =
      await loadCampaignWithConnection(
      params.organizationId,
      fromId,
    );
    const fromNextBudget = Math.max(
      0,
      Number(fromCampaign.daily_budget_pence ?? 0) - amount,
    );
    if (
      fromConnection &&
      fromCampaign.platform_campaign_id &&
      adsWritesEnabled(fromCampaign.platform)
    ) {
      await authorizeAdWrite({
        organizationId: params.organizationId,
        brandId: fromCampaign.brand_id,
        platform: fromCampaign.platform,
        action: "budget_update",
        campaignId: fromCampaign.id,
        actorUserId: params.userId,
        actorName: params.fromAutoOptimise
          ? "ads_optimisation_agent"
          : null,
        currentDailyBudgetPence: fromCampaign.daily_budget_pence,
        proposedDailyBudgetPence: fromNextBudget,
      });
      const { accessToken, connection: freshFrom } =
        await ensureFreshAdAccessToken(fromConnection);
      await getAdsProvider(fromCampaign.platform).updateBudget({
        accessToken,
        accountId: freshFrom.account_id,
        platformCampaignId: fromCampaign.platform_campaign_id,
        dailyBudgetPence: fromNextBudget,
        currency: fromCampaign.currency,
        metadata: {
          ...(freshFrom.metadata ?? {}),
          ...(fromCampaign.platform_metadata ?? {}),
          platform_adset_id: fromCampaign.platform_adset_id,
          platform_budget_id: fromCampaign.platform_budget_id,
        },
      });
    }
    await supabase
      .from("ad_campaigns")
      .update({
        daily_budget_pence: fromNextBudget,
      })
      .eq("id", fromId);
    await auditAdWrite({
      organizationId: params.organizationId,
      actorUserId: params.userId,
      actorName: params.fromAutoOptimise ? "ads_optimisation_agent" : null,
      campaign: fromCampaign,
      action: "ad_campaign_budget_reallocation_source",
      before: { daily_budget_pence: fromCampaign.daily_budget_pence },
      after: { daily_budget_pence: fromNextBudget },
    });
  }
}
