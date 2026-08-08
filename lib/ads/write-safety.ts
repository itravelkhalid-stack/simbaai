import "server-only";

import {
  platformDailyCapFromShare,
  resolvePlatformShares,
  type PlatformAllocationRow,
} from "@/lib/ads/budget-allocation";
import {
  combinedDailyCeiling,
  dailyPaceBounds,
} from "@/lib/ads/budget-pacing";
import { resolveMonthBudget } from "@/lib/ads/budget-schedule";
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
  /** Brand-level combined pot ceiling (monthly/30 ±20% ∩ org limit). */
  combinedPotDailyCeilingPence: number | null;
  projectedBrandCommittedDailyPence: number;
};

/** Live or already created on a platform — counts against the combined pot. */
function isCommittedCampaign(row: {
  id: string;
  status: string;
  platform_campaign_id?: string | null;
}) {
  if (row.status === "active") return true;
  if (row.status === "paused" && row.platform_campaign_id) return true;
  return false;
}

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

  const { data: campaignRows, error: campaignsError } = await supabase
    .from("ad_campaigns")
    .select("id, brand_id, platform, status, daily_budget_pence, platform_campaign_id")
    .eq("organization_id", input.organizationId)
    .in("status", ["active", "paused"]);
  if (campaignsError) {
    return rejectWrite(
      input,
      `Unable to verify campaign spend: ${campaignsError.message}`,
    );
  }

  const rowsAll = campaignRows ?? [];
  const activeRows = rowsAll.filter((row) => row.status === "active");
  const orgSpendWithoutCurrent = activeRows
    .filter((row) => row.id !== input.campaignId)
    .reduce((sum, row) => sum + Number(row.daily_budget_pence ?? 0), 0);
  const brandActiveWithoutCurrent = activeRows
    .filter(
      (row) => row.id !== input.campaignId && row.brand_id === input.brandId,
    )
    .reduce((sum, row) => sum + Number(row.daily_budget_pence ?? 0), 0);

  const brandCommittedWithoutCurrent = rowsAll
    .filter(
      (row) =>
        row.id !== input.campaignId &&
        row.brand_id === input.brandId &&
        isCommittedCampaign(row),
    )
    .reduce((sum, row) => sum + Number(row.daily_budget_pence ?? 0), 0);

  const brandCommittedPlatformWithoutCurrent = rowsAll
    .filter(
      (row) =>
        row.id !== input.campaignId &&
        row.brand_id === input.brandId &&
        row.platform === input.platform &&
        isCommittedCampaign(row),
    )
    .reduce((sum, row) => sum + Number(row.daily_budget_pence ?? 0), 0);

  // create_paused commits a remote budget (paused). activate / budget_update on
  // live or committed campaigns also affect the combined pot.
  const currentIsCommitted = rowsAll.some(
    (row) => row.id === input.campaignId && isCommittedCampaign(row),
  );
  const countsTowardCombinedPot =
    input.action === "activate" ||
    input.action === "create_paused" ||
    (input.action === "budget_update" &&
      (currentIsCommitted ||
        activeRows.some((row) => row.id === input.campaignId)));

  const affectsActiveSpend =
    input.action === "activate" ||
    (input.action === "budget_update" &&
      activeRows.some((row) => row.id === input.campaignId));

  const projectedActiveDailySpendPence =
    orgSpendWithoutCurrent + (affectsActiveSpend ? proposed : 0);
  const projectedBrandActiveDailySpendPence =
    brandActiveWithoutCurrent + (affectsActiveSpend ? proposed : 0);
  const projectedBrandCommittedDailyPence =
    brandCommittedWithoutCurrent + (countsTowardCombinedPot ? proposed : 0);
  const projectedPlatformCommittedDailyPence =
    brandCommittedPlatformWithoutCurrent +
    (countsTowardCombinedPot ? proposed : 0);

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
    projectedBrandActiveDailySpendPence > brandLimits.max_daily_spend_pence &&
    !safetyReducing
  ) {
    return rejectWrite(
      input,
      `Projected brand daily spend ${projectedBrandActiveDailySpendPence}p exceeds the brand cap of ${brandLimits.max_daily_spend_pence}p.`,
    );
  }

  // Combined monthly pot pacing (all platforms share one pot).
  let combinedPotDailyCeilingPence: number | null = null;
  if (countsTowardCombinedPot && !safetyReducing) {
    const monthBudget = await resolveMonthBudget({
      organizationId: input.organizationId,
      brandId: input.brandId,
      admin: true,
    });
    if (monthBudget.budgetPence != null && monthBudget.budgetPence > 0) {
      combinedPotDailyCeilingPence = combinedDailyCeiling({
        monthlyBudgetPence: monthBudget.budgetPence,
        orgMaxDailySpendPence: effectiveMaxDailySpendPence,
      });
      if (projectedBrandCommittedDailyPence > combinedPotDailyCeilingPence) {
        const { max: paceMax } = dailyPaceBounds(monthBudget.budgetPence);
        return rejectWrite(
          input,
          `Projected combined daily spend £${(projectedBrandCommittedDailyPence / 100).toFixed(2)} across all platforms exceeds the monthly pot pacing ceiling £${(combinedPotDailyCeilingPence / 100).toFixed(2)} (monthly/30 ±20% = £${(paceMax / 100).toFixed(2)}, org cap £${(effectiveMaxDailySpendPence / 100).toFixed(2)}). Other platforms' committed budgets count against the shared pot.`,
        );
      }

      // Respect hard per-platform allocation when mode is manual or rows are pinned.
      const shares = resolvePlatformShares({
        monthlyBudgetPence: monthBudget.budgetPence,
        mode: monthBudget.allocationMode,
        allocations: monthBudget.platformAllocations as PlatformAllocationRow[],
        platforms: [
          ...new Set(
            rowsAll
              .filter((r) => r.brand_id === input.brandId)
              .map((r) => r.platform as AdPlatform)
              .concat(input.platform),
          ),
        ],
      });
      const share = shares.find((s) => s.platform === input.platform);
      if (share && (share.locked || monthBudget.allocationMode !== "ai_allocates")) {
        const platformCeiling = Math.min(
          platformDailyCapFromShare({
            monthlySharePence: share.monthly_pence,
          }).max,
          combinedPotDailyCeilingPence,
        );
        if (projectedPlatformCommittedDailyPence > platformCeiling) {
          return rejectWrite(
            input,
            `Projected ${input.platform} daily spend £${(projectedPlatformCommittedDailyPence / 100).toFixed(2)} exceeds its allocation ceiling £${(platformCeiling / 100).toFixed(2)} within the shared monthly pot.`,
          );
        }
      }
    } else if (
      monthBudget.source === "none" &&
      (input.action === "activate" || input.action === "create_paused")
    ) {
      return rejectWrite(
        input,
        "No monthly ad budget pot set for this month (schedule or default). Set Ads → Budgets before launching.",
      );
    }
  }

  return {
    organizationLimits,
    brandLimits,
    effectiveMaxDailySpendPence,
    effectiveMaxSingleCampaignDailyBudgetPence,
    projectedActiveDailySpendPence,
    combinedPotDailyCeilingPence,
    projectedBrandCommittedDailyPence,
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
