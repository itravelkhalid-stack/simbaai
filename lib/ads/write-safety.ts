import "server-only";

import { writeAuditEvent } from "@/lib/compliance/audit";
import { adsWritesEnabled } from "@/lib/ads/providers/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdCampaign, AdPlatform, OrgAdLimits } from "@/lib/types/ads";

export type AdWriteAction =
  | "create_paused"
  | "activate"
  | "pause"
  | "archive"
  | "budget_update"
  | "creative_upload";

type AuthorizationInput = {
  organizationId: string;
  brandId: string;
  platform: AdPlatform;
  action: AdWriteAction;
  campaignId?: string | null;
  actorUserId?: string | null;
  actorName?: string | null;
  currentDailyBudgetPence?: number | null;
  proposedDailyBudgetPence?: number | null;
};

export type AdWriteAuthorization = {
  organizationLimits: OrgAdLimits;
  brandLimits: OrgAdLimits | null;
  effectiveMaxDailySpendPence: number;
  effectiveMaxSingleCampaignDailyBudgetPence: number;
  projectedActiveDailySpendPence: number;
};

function isSafetyReducing(input: AuthorizationInput) {
  if (input.action === "pause" || input.action === "archive") return true;
  if (input.action !== "budget_update") return false;
  return (
    input.currentDailyBudgetPence != null &&
    input.proposedDailyBudgetPence != null &&
    input.proposedDailyBudgetPence <= input.currentDailyBudgetPence
  );
}

async function rejectWrite(input: AuthorizationInput, reason: string): Promise<never> {
  await writeAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    action: "ad_write_rejected",
    entityType: "ad_campaign",
    entityId: input.campaignId ?? null,
    summary: reason,
    before: {
      action: input.action,
      platform: input.platform,
      current_daily_budget_pence: input.currentDailyBudgetPence ?? null,
    },
    after: {
      proposed_daily_budget_pence: input.proposedDailyBudgetPence ?? null,
      rejected: true,
    },
    meta: {
      actor_name: input.actorName ?? null,
      brand_id: input.brandId,
    },
  });
  throw new Error(reason);
}

/**
 * Shared fail-closed authorization for every remote Ads mutation.
 *
 * A global limits row is mandatory. Missing limits, disabled env writes, or a
 * platform kill switch always reject. The master pause permits only
 * safety-reducing writes (pause/archive/budget decrease).
 */
export async function authorizeAdWrite(
  input: AuthorizationInput,
): Promise<AdWriteAuthorization> {
  if (input.platform !== "meta" && input.platform !== "google") {
    return rejectWrite(
      input,
      `Real ad writes are not supported for ${input.platform}; only Meta and Google are enabled in Phase C.`,
    );
  }
  if (!adsWritesEnabled(input.platform)) {
    return rejectWrite(
      input,
      `${input.platform} writes are disabled by ADS_WRITES_ENABLED / ADS_WRITES_${input.platform.toUpperCase()}.`,
    );
  }

  const supabase = createAdminClient();
  const { data: limitRows, error: limitsError } = await supabase
    .from("org_ad_limits")
    .select("*")
    .eq("organization_id", input.organizationId)
    .or(`brand_id.is.null,brand_id.eq.${input.brandId}`);
  if (limitsError) {
    return rejectWrite(input, `Unable to verify ad limits: ${limitsError.message}`);
  }

  const rows = (limitRows ?? []) as OrgAdLimits[];
  const organizationLimits = rows.find((row) => row.brand_id == null) ?? null;
  const brandLimits = rows.find((row) => row.brand_id === input.brandId) ?? null;
  if (!organizationLimits) {
    return rejectWrite(
      input,
      "Ad writes are blocked until organization spend limits are configured in Ads → Settings.",
    );
  }

  const killed =
    organizationLimits.platform_kill_switches?.[input.platform] === true ||
    brandLimits?.platform_kill_switches?.[input.platform] === true;
  if (killed) {
    return rejectWrite(
      input,
      `${input.platform} ad writes are blocked by the platform kill switch.`,
    );
  }

  const safetyReducing = isSafetyReducing(input);
  if (
    (organizationLimits.writes_paused || brandLimits?.writes_paused) &&
    !safetyReducing
  ) {
    return rejectWrite(
      input,
      "Ad writes are paused by the organization/brand master kill switch. Only pause, archive, or budget reductions are allowed.",
    );
  }

  const effectiveMaxDailySpendPence = Math.min(
    organizationLimits.max_daily_spend_pence,
    brandLimits?.max_daily_spend_pence ?? Number.MAX_SAFE_INTEGER,
  );
  const effectiveMaxSingleCampaignDailyBudgetPence = Math.min(
    organizationLimits.max_single_campaign_daily_budget_pence,
    brandLimits?.max_single_campaign_daily_budget_pence ??
      Number.MAX_SAFE_INTEGER,
  );
  const proposed = input.proposedDailyBudgetPence ?? 0;

  if (
    proposed > effectiveMaxSingleCampaignDailyBudgetPence &&
    !safetyReducing
  ) {
    return rejectWrite(
      input,
      `Proposed daily budget ${proposed}p exceeds the per-campaign cap of ${effectiveMaxSingleCampaignDailyBudgetPence}p.`,
    );
  }

  const { data: activeRows, error: activeError } = await supabase
    .from("ad_campaigns")
    .select("id, brand_id, daily_budget_pence")
    .eq("organization_id", input.organizationId)
    .eq("status", "active");
  if (activeError) {
    return rejectWrite(input, `Unable to verify active spend: ${activeError.message}`);
  }

  const orgSpendWithoutCurrent = (activeRows ?? [])
    .filter((row) => row.id !== input.campaignId)
    .reduce((sum, row) => sum + Number(row.daily_budget_pence ?? 0), 0);
  const brandSpendWithoutCurrent = (activeRows ?? [])
    .filter(
      (row) => row.id !== input.campaignId && row.brand_id === input.brandId,
    )
    .reduce((sum, row) => sum + Number(row.daily_budget_pence ?? 0), 0);

  const affectsActiveSpend =
    input.action === "activate" ||
    (input.action === "budget_update" &&
      (activeRows ?? []).some((row) => row.id === input.campaignId));
  const projectedActiveDailySpendPence =
    orgSpendWithoutCurrent + (affectsActiveSpend ? proposed : 0);
  const projectedBrandDailySpendPence =
    brandSpendWithoutCurrent + (affectsActiveSpend ? proposed : 0);

  if (
    affectsActiveSpend &&
    projectedActiveDailySpendPence >
      organizationLimits.max_daily_spend_pence &&
    !safetyReducing
  ) {
    return rejectWrite(
      input,
      `Projected organization daily spend ${projectedActiveDailySpendPence}p exceeds the organization cap of ${organizationLimits.max_daily_spend_pence}p.`,
    );
  }
  if (
    affectsActiveSpend &&
    brandLimits &&
    projectedBrandDailySpendPence > brandLimits.max_daily_spend_pence &&
    !safetyReducing
  ) {
    return rejectWrite(
      input,
      `Projected brand daily spend ${projectedBrandDailySpendPence}p exceeds the brand cap of ${brandLimits.max_daily_spend_pence}p.`,
    );
  }

  return {
    organizationLimits,
    brandLimits,
    effectiveMaxDailySpendPence,
    effectiveMaxSingleCampaignDailyBudgetPence,
    projectedActiveDailySpendPence,
  };
}

export async function auditAdWrite(params: {
  organizationId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  campaign: Pick<AdCampaign, "id" | "platform" | "status" | "daily_budget_pence">;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  meta?: Record<string, unknown>;
}) {
  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId ?? null,
    action: params.action,
    entityType: "ad_campaign",
    entityId: params.campaign.id,
    summary: `${params.action} on ${params.campaign.platform} campaign`,
    before: params.before ?? null,
    after: params.after ?? null,
    meta: {
      actor_name: params.actorName ?? null,
      ...params.meta,
    },
  });
}
