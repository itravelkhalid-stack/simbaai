"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { ensureFreshAdAccessToken } from "@/lib/ads/connections";
import { getAdsProvider } from "@/lib/ads/providers";
import { AdsWriteDisabledError } from "@/lib/ads/providers/types";
import { auditAdWrite, authorizeAdWrite } from "@/lib/ads/write-safety";
import { requireActiveOrg } from "@/lib/org/require";
import { adsTable } from "@/lib/ads/db";
import { assertMetaCreateDailyBudget } from "@/lib/ads/meta-budget";
import { createClient } from "@/lib/supabase/server";
import type {
  AdCampaign,
  AdConnection,
  AdCreative,
  OrgAdLimits,
} from "@/lib/types/ads";

export type AdsMutateState = {
  error?: string;
  success?: string;
  gate?: string;
  fbtraceId?: string;
  stale?: boolean;
};

export type CreateCampaignsState = AdsMutateState;

class AdsGateError extends Error {
  gate: string;
  fbtraceId?: string;
  constructor(gate: string, message: string, fbtraceId?: string) {
    super(message);
    this.name = "AdsGateError";
    this.gate = gate;
    this.fbtraceId = fbtraceId;
  }
}

async function assertCanManageAds() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new AdsGateError(
      "authorize",
      "Viewers cannot modify ad campaigns. Ask an org member or admin.",
    );
  }
  return ctx;
}

function classifyAdsError(error: unknown): {
  gate: string;
  message: string;
  fbtraceId?: string;
} {
  if (error instanceof AdsGateError) {
    return {
      gate: error.gate,
      message: error.message,
      fbtraceId: error.fbtraceId,
    };
  }
  if (error instanceof AdsWriteDisabledError) {
    return { gate: "ads_writes_disabled", message: error.message };
  }
  const message =
    error instanceof Error ? error.message : "Unexpected ads write failure";
  const fbtraceMatch = message.match(/fbtrace_id=([A-Za-z0-9_-]+)/);
  const fbtraceId = fbtraceMatch?.[1];
  if (/ADS_WRITES_ENABLED|ADS_WRITES_META|ADS_WRITES_GOOGLE|writes are disabled/i.test(message)) {
    return { gate: "ads_writes_disabled", message, fbtraceId };
  }
  if (/master pause|writes_paused|kill switch|hard limits|org_ad_limits/i.test(message)) {
    return { gate: "ads_writes_disabled", message, fbtraceId };
  }
  if (/below Meta|daily budget|META_MIN|ad set minimum/i.test(message)) {
    return { gate: "meta_budget", message, fbtraceId };
  }
  if (/Ads API|Graph API|fbtrace_id|OAuthException/i.test(message)) {
    return { gate: "meta_api", message, fbtraceId };
  }
  if (/connection/i.test(message)) {
    return { gate: "connection", message, fbtraceId };
  }
  return { gate: "unknown", message, fbtraceId };
}

async function persistCampaignLastError(
  organizationId: string,
  campaignId: string | null | undefined,
  message: string,
) {
  if (!campaignId) return;
  try {
    const supabase = await createClient();
    await supabase
      .from("ad_campaigns")
      .update({ last_error: message.slice(0, 2000) })
      .eq("id", campaignId)
      .eq("organization_id", organizationId);
  } catch {
    // Best-effort — never mask the original failure.
  }
}

export async function attachMediaAssetToAdCreative(formData: FormData) {
  const { user, active } = await assertCanManageAds();
  const creativeId = String(formData.get("creativeId") ?? "");
  const assetId = String(formData.get("assetId") ?? "");
  if (!creativeId || !assetId) throw new Error("Creative and media asset required");
  const supabase = await createClient();
  const [{ data: creative }, { data: asset }] = await Promise.all([
    supabase
      .from("ad_creatives")
      .select("id, brand_id, media_urls")
      .eq("id", creativeId)
      .eq("organization_id", active.organization_id)
      .single(),
    supabase
      .from("media_assets")
      .select("id, brand_id, public_url, type")
      .eq("id", assetId)
      .eq("organization_id", active.organization_id)
      .single(),
  ]);
  if (!creative || !asset) throw new Error("Creative or media asset not found");
  if (creative.brand_id !== asset.brand_id) {
    throw new Error("Media asset must belong to the creative's brand");
  }
  if (asset.type !== "image" && asset.type !== "logo") {
    throw new Error("Meta ad creatives currently require an image or logo asset");
  }
  const before = (creative.media_urls as string[] | null) ?? [];
  const after = Array.from(new Set([...before, asset.public_url]));
  const { error } = await supabase
    .from("ad_creatives")
    .update({ media_urls: after })
    .eq("id", creative.id)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);
  const { writeAuditEvent } = await import("@/lib/compliance/audit");
  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "ad_creative_media_attach",
    entityType: "ad",
    entityId: creative.id,
    summary: "Attached brand media asset to ad creative",
    before: { media_urls: before },
    after: { media_urls: after, media_asset_id: asset.id },
  });
  revalidatePath("/ads/approvals");
}

async function loadCampaignContext(organizationId: string, campaignId: string) {
  const supabase = await createClient();
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
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .maybeSingle();
    connection = (data as AdConnection | null) ?? null;
  }
  if (!connection) {
    const { data } = await supabase
      .from("ad_connections")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("brand_id", campaign.brand_id)
      .eq("platform", campaign.platform)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    connection = (data as AdConnection | null) ?? null;
  }
  if (!connection) {
    throw new Error(
      `No active ${campaign.platform} Ads connection for this brand.`,
    );
  }
  if (connection.paused) {
    throw new Error(
      `${campaign.platform} Ads connection is paused. Resume it in Ads → Connections.`,
    );
  }

  return { supabase, campaign: campaign as AdCampaign, connection };
}

function platformWriteMetadata(campaign: AdCampaign, connection: AdConnection) {
  return {
    ...(connection.metadata ?? {}),
    ...(campaign.platform_metadata ?? {}),
    platform_adset_id: campaign.platform_adset_id,
    platform_ad_id: campaign.platform_ad_id,
    platform_budget_id: campaign.platform_budget_id,
  };
}

export async function createCampaignsPaused(
  _prev: CreateCampaignsState,
  formData: FormData,
): Promise<CreateCampaignsState> {
  let campaignId = String(formData.get("campaignId") ?? "");
  let organizationId: string | null = null;

  try {
    const { user, active } = await assertCanManageAds();
    organizationId = active.organization_id;
    campaignId = String(formData.get("campaignId") ?? "");
    const finalUrl = String(formData.get("finalUrl") ?? "").trim();
    const countries = String(formData.get("countries") ?? "GB")
      .split(",")
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean);
    if (!campaignId) {
      throw new AdsGateError("validation", "Missing campaign id.");
    }
    try {
      const parsed = new URL(finalUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("Unsupported protocol");
      }
    } catch {
      throw new AdsGateError(
        "validation",
        "A valid final destination URL is required (http or https).",
      );
    }

    const { supabase, campaign, connection } = await loadCampaignContext(
      active.organization_id,
      campaignId,
    );
    if (campaign.platform !== "meta" && campaign.platform !== "google") {
      throw new AdsGateError(
        "validation",
        "Phase C supports real writes for Meta and Google only.",
      );
    }
    if (campaign.platform_campaign_id) {
      throw new AdsGateError(
        "validation",
        "Campaign has already been created on the platform.",
      );
    }
    if (!campaign.daily_budget_pence || campaign.daily_budget_pence <= 0) {
      throw new AdsGateError(
        "meta_budget",
        "Set a positive daily budget before platform creation.",
      );
    }
    if (campaign.platform === "meta") {
      try {
        assertMetaCreateDailyBudget(campaign.daily_budget_pence);
      } catch (error) {
        throw new AdsGateError(
          "meta_budget",
          error instanceof Error ? error.message : "Meta daily budget too low.",
        );
      }
    }

    const { data: creativeRows } = await supabase
      .from("ad_creatives")
      .select("*")
      .eq("campaign_id", campaign.id)
      .eq("organization_id", active.organization_id)
      .eq("status", "approved")
      .order("approved_at", { ascending: true });
    const creatives = (creativeRows ?? []) as AdCreative[];
    if (!creatives.length) {
      throw new AdsGateError(
        "creatives",
        "Approve at least one creative variant before platform creation. Open Ads → Approvals, approve creatives with images attached, then re-run Launch review.",
      );
    }
    if (
      campaign.platform === "meta" &&
      !creatives.some((creative) => creative.media_urls?.length)
    ) {
      throw new AdsGateError(
        "creatives",
        "Meta creation requires an approved creative with an attached image. Attach media on the creative, then re-run Launch review.",
      );
    }

    // Launch review board + CMO gate (Meta Ads pipeline)
    {
      const { data: review } = await adsTable(supabase, "ad_launch_reviews")
        .select("id, all_passed, cmo_approved_at, status")
        .eq("campaign_id", campaign.id)
        .eq("organization_id", active.organization_id)
        .maybeSingle();
      if (!review) {
        throw new AdsGateError(
          "launch_review",
          "Launch review board missing — click “Re-run checks” on this campaign, then get CMO approval before creating PAUSED.",
        );
      }
      if (!review.all_passed || review.status !== "passed") {
        const { data: signoffs } = await adsTable(
          supabase,
          "ad_launch_review_signoffs",
        )
          .select("department, result, notes")
          .eq("review_id", review.id)
          .eq("organization_id", active.organization_id);
        const failed = (signoffs ?? []).filter(
          (s: { result: string }) => s.result === "fail",
        ) as Array<{ department: string; result: string; notes: string | null }>;
        const pending = (signoffs ?? []).filter(
          (s: { result: string }) => s.result === "pending",
        ) as Array<{ department: string }>;
        const failedSummary = failed.length
          ? failed
              .map((s) => `${s.department}${s.notes ? ` (${s.notes})` : ""}`)
              .join("; ")
          : "see Pipeline record above";
        const pendingSummary = pending.length
          ? ` Pending: ${pending.map((s) => s.department).join(", ")}.`
          : "";
        throw new AdsGateError(
          "launch_review",
          `Launch review status is “${review.status}” — not ready to create. Failed: ${failedSummary}.${pendingSummary} Re-run Launch review after approving creatives, then get CMO approval.`,
        );
      }
      if (!review.cmo_approved_at) {
        throw new AdsGateError(
          "cmo_approval",
          "CMO must approve the passed launch review before creating a PAUSED campaign. Use “CMO approve for paused create” in the Pipeline record above.",
        );
      }
    }

    await authorizeAdWrite({
      organizationId: active.organization_id,
      brandId: campaign.brand_id,
      platform: campaign.platform,
      action: "create_paused",
      campaignId: campaign.id,
      actorUserId: user.id,
      proposedDailyBudgetPence: campaign.daily_budget_pence,
    });

    let metadata: Record<string, unknown> = connection.metadata ?? {};
    if (campaign.platform === "meta") {
      const { data: social } = await supabase
        .from("social_connections")
        .select("metadata")
        .eq("organization_id", active.organization_id)
        .eq("brand_id", campaign.brand_id)
        .eq("platform", "facebook")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      metadata = {
        ...metadata,
        ...((social?.metadata as Record<string, unknown> | null) ?? {}),
      };
    }

    const { accessToken, connection: fresh } =
      await ensureFreshAdAccessToken(connection);
    const provider = getAdsProvider(campaign.platform);
    const result = await provider.createCampaign({
      accessToken,
      accountId: fresh.account_id,
      name: campaign.name,
      objective: campaign.objective ?? undefined,
      dailyBudgetPence: campaign.daily_budget_pence ?? undefined,
      lifetimeBudgetPence: campaign.lifetime_budget_pence ?? undefined,
      currency: campaign.currency,
      startDate: campaign.start_date ?? undefined,
      endDate: campaign.end_date ?? undefined,
      targeting: {
        ...(campaign.targeting ?? {}),
        countries,
        final_url: finalUrl,
      },
      finalUrl,
      metadata,
      creatives: creatives.map((creative) => ({
        localCreativeId: creative.id,
        headline: creative.headline,
        primaryText: creative.primary_text,
        description: creative.description,
        cta: creative.cta,
        mediaUrls: creative.media_urls ?? [],
      })),
    });

    const now = new Date().toISOString();
    const platformMetadata = {
      ...metadata,
      final_url: finalUrl,
      countries,
      approved_creative_ids: creatives.map((creative) => creative.id),
      remote: result.raw ?? {},
    };
    const { error: updateError } = await supabase
      .from("ad_campaigns")
      .update({
        connection_id: fresh.id,
        platform_campaign_id: result.platformCampaignId,
        platform_adset_id: result.platformAdSetId ?? null,
        platform_ad_id: result.platformAdId ?? null,
        platform_budget_id: result.platformBudgetId ?? null,
        platform_metadata: platformMetadata,
        targeting: {
          ...(campaign.targeting ?? {}),
          countries,
          final_url: finalUrl,
        },
        status: "pending_approval",
        remote_created_at: now,
        last_error: null,
      })
      .eq("id", campaign.id)
      .eq("organization_id", active.organization_id);
    if (updateError) {
      try {
        await provider.setCampaignStatus({
          accessToken,
          accountId: fresh.account_id,
          platformCampaignId: result.platformCampaignId,
          status: "archived",
          metadata: {
            ...metadata,
            platform_adset_id: result.platformAdSetId,
            platform_ad_id: result.platformAdId,
            platform_budget_id: result.platformBudgetId,
          },
        });
      } catch {
        // Remote hierarchy is PAUSED. Preserve original persistence error.
      }
      throw new AdsGateError("persist", updateError.message);
    }

    for (let index = 0; index < creatives.length; index++) {
      const remoteId =
        result.platformCreativeIds?.[index] ??
        result.platformCreativeIds?.[0] ??
        null;
      if (remoteId) {
        await supabase
          .from("ad_creatives")
          .update({ platform_creative_id: remoteId })
          .eq("id", creatives[index].id);
      }
    }

    await auditAdWrite({
      organizationId: active.organization_id,
      actorUserId: user.id,
      campaign,
      action: "ad_campaign_create_paused",
      before: { status: campaign.status, platform_campaign_id: null },
      after: {
        status: "pending_approval",
        platform_campaign_id: result.platformCampaignId,
        platform_adset_id: result.platformAdSetId ?? null,
        platform_ad_id: result.platformAdId ?? null,
        daily_budget_pence: campaign.daily_budget_pence,
      },
    });

    const { notifyApprovalsNeeded } = await import("@/lib/notifications/notify");
    await notifyApprovalsNeeded({
      organizationId: active.organization_id,
      title: "Ad campaign ready for approval",
      body: campaign.name,
      link: "/ads/approvals",
    });

    revalidatePath(`/ads/campaigns/${campaign.id}`);
    revalidatePath("/ads/campaigns");
    revalidatePath("/ads/approvals");
    return {
      success: `Created PAUSED on ${campaign.platform}. Campaign is ready for “Approve & set live”.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    const classified = classifyAdsError(error);
    const fbtraceId = classified.fbtraceId;
    if (organizationId && campaignId) {
      await persistCampaignLastError(
        organizationId,
        campaignId,
        classified.message,
      );
      revalidatePath(`/ads/campaigns/${campaignId}`);
    }
    return {
      error: classified.message,
      gate: classified.gate,
      fbtraceId,
    };
  }
}

/** Build all still-local Meta/Google campaigns in an approved media plan. */
export async function createPlanCampaignsPaused(formData: FormData) {
  const { active } = await assertCanManageAds();
  const planId = String(formData.get("planId") ?? "");
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("ad_media_plans")
    .select("id, brand_id, status")
    .eq("id", planId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!plan || plan.status !== "approved") {
    throw new Error("Approve the media plan before platform creation");
  }
  const [{ data: campaigns }, { data: brand }] = await Promise.all([
    supabase
      .from("ad_campaigns")
      .select("id, targeting")
      .eq("media_plan_id", planId)
      .eq("organization_id", active.organization_id)
      .in("platform", ["meta", "google"])
      .is("platform_campaign_id", null),
    supabase
      .from("brands")
      .select("website")
      .eq("id", plan.brand_id)
      .eq("organization_id", active.organization_id)
      .single(),
  ]);
  if (!brand?.website) {
    throw new Error(
      "Set a valid brand website before creating plan campaigns, or create each campaign from its detail page with a final URL.",
    );
  }
  if (!(campaigns ?? []).length) {
    throw new Error("No uncreated Meta/Google campaigns remain in this plan");
  }

  for (const campaign of campaigns ?? []) {
    const child = new FormData();
    child.set("campaignId", campaign.id);
    child.set(
      "finalUrl",
      typeof campaign.targeting?.final_url === "string"
        ? campaign.targeting.final_url
        : brand.website,
    );
    child.set(
      "countries",
      Array.isArray(campaign.targeting?.countries)
        ? (campaign.targeting.countries as string[]).join(",")
        : "GB",
    );
    const result = await createCampaignsPaused({}, child);
    if (result.error) {
      throw new Error(`${campaign.id}: ${result.error}`);
    }
  }
  revalidatePath(`/ads/plans/${planId}`);
  revalidatePath("/ads/approvals");
}

async function wrapCampaignMutate(
  formData: FormData,
  run: (ctx: {
    user: Awaited<ReturnType<typeof assertCanManageAds>>["user"];
    active: Awaited<ReturnType<typeof assertCanManageAds>>["active"];
    campaignId: string;
  }) => Promise<string>,
): Promise<AdsMutateState> {
  let campaignId = String(formData.get("campaignId") ?? "");
  let organizationId: string | null = null;
  try {
    const { user, active } = await assertCanManageAds();
    organizationId = active.organization_id;
    campaignId = String(formData.get("campaignId") ?? "");
    if (!campaignId) {
      throw new AdsGateError("validation", "Missing campaign id.");
    }
    const success = await run({ user, active, campaignId });
    revalidatePath(`/ads/campaigns/${campaignId}`);
    return { success };
  } catch (error) {
    unstable_rethrow(error);
    const classified = classifyAdsError(error);
    if (organizationId && campaignId) {
      await persistCampaignLastError(
        organizationId,
        campaignId,
        classified.message,
      );
      revalidatePath(`/ads/campaigns/${campaignId}`);
    }
    return {
      error: classified.message,
      gate: classified.gate,
      fbtraceId: classified.fbtraceId,
    };
  }
}

export async function setCampaignLive(
  _prev: AdsMutateState,
  formData: FormData,
): Promise<AdsMutateState> {
  return wrapCampaignMutate(formData, async ({ user, active, campaignId }) => {
    const { supabase, campaign, connection } = await loadCampaignContext(
      active.organization_id,
      campaignId,
    );
    if (!campaign.platform_campaign_id) {
      throw new AdsGateError(
        "validation",
        "Create the campaign paused on the platform first.",
      );
    }
    if (campaign.status !== "pending_approval" && campaign.status !== "paused") {
      throw new AdsGateError(
        "validation",
        "Only pending or paused campaigns can be set live.",
      );
    }

    await authorizeAdWrite({
      organizationId: active.organization_id,
      brandId: campaign.brand_id,
      platform: campaign.platform,
      action: "activate",
      campaignId: campaign.id,
      actorUserId: user.id,
      proposedDailyBudgetPence: campaign.daily_budget_pence,
    });

    const { accessToken, connection: fresh } =
      await ensureFreshAdAccessToken(connection);
    await getAdsProvider(campaign.platform).setCampaignStatus({
      accessToken,
      accountId: fresh.account_id,
      platformCampaignId: campaign.platform_campaign_id,
      status: "active",
      metadata: platformWriteMetadata(campaign, fresh),
    });
    const now = new Date().toISOString();
    await supabase
      .from("ad_campaigns")
      .update({
        status: "active",
        launch_approved_by: user.id,
        launch_approved_at: now,
        last_error: null,
      })
      .eq("id", campaign.id);
    await auditAdWrite({
      organizationId: active.organization_id,
      actorUserId: user.id,
      campaign,
      action: "ad_campaign_activate",
      before: { status: campaign.status },
      after: {
        status: "active",
        daily_budget_pence: campaign.daily_budget_pence,
        approved_at: now,
      },
    });
    revalidatePath("/ads/approvals");
    return "Campaign set live.";
  });
}

export async function pauseAdCampaign(
  _prev: AdsMutateState,
  formData: FormData,
): Promise<AdsMutateState> {
  return wrapCampaignMutate(formData, async ({ user, active, campaignId }) => {
    const { supabase, campaign, connection } = await loadCampaignContext(
      active.organization_id,
      campaignId,
    );
    if (!campaign.platform_campaign_id) {
      throw new AdsGateError("validation", "Campaign is not remote.");
    }
    await authorizeAdWrite({
      organizationId: active.organization_id,
      brandId: campaign.brand_id,
      platform: campaign.platform,
      action: "pause",
      campaignId: campaign.id,
      actorUserId: user.id,
      currentDailyBudgetPence: campaign.daily_budget_pence,
    });
    const { accessToken, connection: fresh } =
      await ensureFreshAdAccessToken(connection);
    await getAdsProvider(campaign.platform).setCampaignStatus({
      accessToken,
      accountId: fresh.account_id,
      platformCampaignId: campaign.platform_campaign_id,
      status: "paused",
      metadata: platformWriteMetadata(campaign, fresh),
    });
    await supabase
      .from("ad_campaigns")
      .update({ status: "paused", last_error: null })
      .eq("id", campaign.id);
    await auditAdWrite({
      organizationId: active.organization_id,
      actorUserId: user.id,
      campaign,
      action: "ad_campaign_pause",
      before: { status: campaign.status },
      after: { status: "paused" },
    });
    return "Campaign paused.";
  });
}

export async function updateAdCampaignBudget(
  _prev: AdsMutateState,
  formData: FormData,
): Promise<AdsMutateState> {
  return wrapCampaignMutate(formData, async ({ user, active, campaignId }) => {
    const pounds = Number(formData.get("dailyBudgetMajor") ?? 0);
    const proposed = Math.round(pounds * 100);
    if (!Number.isFinite(proposed) || proposed <= 0) {
      throw new AdsGateError(
        "meta_budget",
        "Daily budget must be greater than zero.",
      );
    }
    const { supabase, campaign, connection } = await loadCampaignContext(
      active.organization_id,
      campaignId,
    );
    if (!campaign.platform_campaign_id) {
      throw new AdsGateError("validation", "Campaign is not remote.");
    }
    if (campaign.platform === "meta") {
      try {
        assertMetaCreateDailyBudget(proposed);
      } catch (error) {
        throw new AdsGateError(
          "meta_budget",
          error instanceof Error ? error.message : "Meta daily budget too low.",
        );
      }
    }
    await authorizeAdWrite({
      organizationId: active.organization_id,
      brandId: campaign.brand_id,
      platform: campaign.platform,
      action: "budget_update",
      campaignId: campaign.id,
      actorUserId: user.id,
      currentDailyBudgetPence: campaign.daily_budget_pence,
      proposedDailyBudgetPence: proposed,
    });
    const { accessToken, connection: fresh } =
      await ensureFreshAdAccessToken(connection);
    await getAdsProvider(campaign.platform).updateBudget({
      accessToken,
      accountId: fresh.account_id,
      platformCampaignId: campaign.platform_campaign_id,
      dailyBudgetPence: proposed,
      currency: campaign.currency,
      metadata: platformWriteMetadata(campaign, fresh),
    });
    await supabase
      .from("ad_campaigns")
      .update({ daily_budget_pence: proposed, last_error: null })
      .eq("id", campaign.id);
    await auditAdWrite({
      organizationId: active.organization_id,
      actorUserId: user.id,
      campaign,
      action: "ad_campaign_budget_update",
      before: { daily_budget_pence: campaign.daily_budget_pence },
      after: { daily_budget_pence: proposed },
    });
    return `Daily budget updated to £${(proposed / 100).toFixed(2)}.`;
  });
}

export async function archiveAdCampaign(
  _prev: AdsMutateState,
  formData: FormData,
): Promise<AdsMutateState> {
  return wrapCampaignMutate(formData, async ({ user, active, campaignId }) => {
    const { supabase, campaign, connection } = await loadCampaignContext(
      active.organization_id,
      campaignId,
    );
    if (!campaign.platform_campaign_id) {
      throw new AdsGateError("validation", "Campaign is not remote.");
    }
    await authorizeAdWrite({
      organizationId: active.organization_id,
      brandId: campaign.brand_id,
      platform: campaign.platform,
      action: "archive",
      campaignId: campaign.id,
      actorUserId: user.id,
      currentDailyBudgetPence: campaign.daily_budget_pence,
    });
    const { accessToken, connection: fresh } =
      await ensureFreshAdAccessToken(connection);
    await getAdsProvider(campaign.platform).setCampaignStatus({
      accessToken,
      accountId: fresh.account_id,
      platformCampaignId: campaign.platform_campaign_id,
      status: "archived",
      metadata: platformWriteMetadata(campaign, fresh),
    });
    await supabase
      .from("ad_campaigns")
      .update({ status: "archived", last_error: null })
      .eq("id", campaign.id);
    await auditAdWrite({
      organizationId: active.organization_id,
      actorUserId: user.id,
      campaign,
      action: "ad_campaign_archive",
      before: { status: campaign.status },
      after: { status: "archived" },
    });
    return "Campaign archived.";
  });
}

export async function saveOrgAdLimits(
  _prev: { error?: string; success?: string },
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  try {
    const { user, active } = await requireActiveOrg();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only organization owners/admins can change ad limits" };
    }
    const maxDaily = Math.round(Number(formData.get("maxDailySpendMajor")) * 100);
    const maxSingle = Math.round(Number(formData.get("maxSingleMajor")) * 100);
    if (
      !Number.isFinite(maxDaily) ||
      !Number.isFinite(maxSingle) ||
      maxDaily < 0 ||
      maxSingle < 0
    ) {
      return { error: "Limits must be valid non-negative amounts" };
    }
    if (maxSingle > maxDaily) {
      return {
        error: "Single-campaign cap cannot exceed the organization daily cap",
      };
    }

    const supabase = await createClient();
    const brandId = String(formData.get("brandId") ?? "").trim() || null;
    if (brandId) {
      const { data: brand } = await supabase
        .from("brands")
        .select("id")
        .eq("id", brandId)
        .eq("organization_id", active.organization_id)
        .maybeSingle();
      if (!brand) return { error: "Brand does not belong to this organization" };
    }
    const existingResult = brandId
      ? await supabase
          .from("org_ad_limits")
          .select("id")
          .eq("organization_id", active.organization_id)
          .eq("brand_id", brandId)
          .maybeSingle()
      : await supabase
          .from("org_ad_limits")
          .select("id")
          .eq("organization_id", active.organization_id)
          .is("brand_id", null)
          .maybeSingle();
    const values = {
      organization_id: active.organization_id,
      brand_id: brandId,
      max_daily_spend_pence: maxDaily,
      max_single_campaign_daily_budget_pence: maxSingle,
      writes_paused: formData.get("writesPaused") === "on",
      platform_kill_switches: {
        meta: formData.get("killMeta") === "on",
        google: formData.get("killGoogle") === "on",
        tiktok: true,
        x: true,
        bing: true,
      },
      updated_by: user.id,
    };
    const resolvedExisting = existingResult.data;
    const result = resolvedExisting
      ? await supabase
          .from("org_ad_limits")
          .update(values)
          .eq("id", resolvedExisting.id)
      : await supabase
          .from("org_ad_limits")
          .insert({ ...values, created_by: user.id });
    if (result.error) return { error: result.error.message };

    const { writeAuditEvent } = await import("@/lib/compliance/audit");
    await writeAuditEvent({
      organizationId: active.organization_id,
      actorUserId: user.id,
      action: "ad_limits_update",
      entityType: brandId ? "brand_ad_limits" : "org_ad_limits",
      entityId: brandId ?? active.organization_id,
      summary: brandId
        ? "Updated brand ad safety limits"
        : "Updated organization ad safety limits",
      after: values as unknown as Record<string, unknown>,
    });
    revalidatePath("/ads/settings");
    return {
      success: values.writes_paused
        ? "Hard limits saved (master pause ON — remote creates/launches blocked)."
        : "Hard limits saved (master pause off).",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save hard limits",
    };
  }
}

export async function getOrgAdLimits(
  organizationId: string,
): Promise<OrgAdLimits | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_ad_limits")
    .select("*")
    .eq("organization_id", organizationId)
    .is("brand_id", null)
    .maybeSingle();
  return (data as OrgAdLimits | null) ?? null;
}
