import "server-only";

import { authorizeAdWrite, type AdWriteAction } from "@/lib/ads/write-safety";
import { writeAuditEvent } from "@/lib/compliance/audit";
import { notifyOrgAdmins } from "@/lib/notifications/notify";
import {
  effectiveAutonomyMode,
  parseBrandAutonomy,
  type AutonomyChannel,
  type AutonomyMode,
  type BrandAutonomySettings,
} from "@/lib/autonomy/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdPlatform } from "@/lib/types/ads";
import type { Brand } from "@/lib/types/research";

export type AgentActionKind =
  | "ads_create_paused"
  | "ads_activate"
  | "ads_pause"
  | "ads_archive"
  | "ads_budget_update"
  | "organic_publish"
  | "content_schedule"
  | "growth_propose"
  | "growth_execute"
  | "email_send"
  | "outbound_webhook";

export type AuthorizeAgentActionInput = {
  organizationId: string;
  brandId: string;
  channel: AutonomyChannel;
  action: AgentActionKind;
  /** Human trigger (UI). Null/undefined means agent-initiated. */
  actorUserId?: string | null;
  agentName?: string | null;
  entityType?: string;
  entityId?: string | null;
  summary?: string;
  /** Ads-specific fields */
  platform?: AdPlatform;
  campaignId?: string | null;
  currentDailyBudgetPence?: number | null;
  proposedDailyBudgetPence?: number | null;
  /** Organic: latest compliance check status */
  complianceStatus?: "pass" | "warn" | "fail" | null;
  /** When true, allow queueing a recommendation even if mode is approval */
  allowAsRecommendation?: boolean;
};

export type AuthorizeAgentActionResult = {
  mode: AutonomyMode;
  settings: BrandAutonomySettings;
  /** True when the caller may execute the outbound action now. */
  mayExecute: boolean;
  /** True when the action should land in an approvals/recommendations queue. */
  mustQueue: boolean;
  reason: string;
};

const AD_ACTION_MAP: Partial<Record<AgentActionKind, AdWriteAction>> = {
  ads_create_paused: "create_paused",
  ads_activate: "activate",
  ads_pause: "pause",
  ads_archive: "archive",
  ads_budget_update: "budget_update",
};

function maxAllowedBudgetIncrease(current: number) {
  return Math.floor(current * 1.2);
}

/**
 * Shared authorization for every agent outbound path.
 *
 * - Kill switch (`agent_activity_paused`) blocks all brand-scoped agent work,
 *   scheduled Claude jobs, retries, and autonomous publishing.
 * - Approval mode queues outbound actions for humans.
 * - Autonomous mode may execute within Phase C ad limits + organic compliance.
 * - Ads budget increases are capped at +20%/day relative to the current budget.
 */
export async function authorizeAgentAction(
  input: AuthorizeAgentActionInput,
): Promise<AuthorizeAgentActionResult> {
  const supabase = createAdminClient();
  const { data: brand, error } = await supabase
    .from("brands")
    .select(
      "id, autonomy_mode, channel_modes, agent_activity_paused, autonomy_min_roas, autonomy_max_cpa_pence",
    )
    .eq("id", input.brandId)
    .eq("organization_id", input.organizationId)
    .single();
  if (error || !brand) {
    throw new Error(error?.message ?? "Brand not found for autonomy check");
  }

  const settings = parseBrandAutonomy(brand as Brand);
  const mode = effectiveAutonomyMode(settings, input.channel);
  const isAgent = !input.actorUserId;
  const agentName = input.agentName ?? "agent";

  if (settings.agentActivityPaused) {
    const result: AuthorizeAgentActionResult = {
      mode,
      settings,
      mayExecute: false,
      mustQueue: false,
      reason:
        "Brand agent activity is paused. Autonomous execution and scheduled publishing are halted.",
    };
    if (isAgent) {
      await writeAuditEvent({
        organizationId: input.organizationId,
        actorUserId: null,
        action: "agent_action_blocked",
        entityType: input.entityType ?? input.channel,
        entityId: input.entityId ?? null,
        summary: result.reason,
        meta: {
          actor: "agent",
          actor_name: agentName,
          action: input.action,
          channel: input.channel,
          brand_id: input.brandId,
        },
      });
    }
    if (!input.allowAsRecommendation) {
      throw new Error(result.reason);
    }
    return result;
  }

  // Human operators always may execute (UI paths); autonomy gates agents.
  if (!isAgent) {
    if (input.channel === "ads" && input.platform && AD_ACTION_MAP[input.action]) {
      await authorizeAdWrite({
        organizationId: input.organizationId,
        brandId: input.brandId,
        platform: input.platform,
        action: AD_ACTION_MAP[input.action]!,
        campaignId: input.campaignId,
        actorUserId: input.actorUserId,
        currentDailyBudgetPence: input.currentDailyBudgetPence,
        proposedDailyBudgetPence: input.proposedDailyBudgetPence,
      });
    }
    if (
      input.action === "ads_budget_update" &&
      input.currentDailyBudgetPence != null &&
      input.proposedDailyBudgetPence != null &&
      input.proposedDailyBudgetPence > input.currentDailyBudgetPence
    ) {
      const cap = maxAllowedBudgetIncrease(input.currentDailyBudgetPence);
      // Humans are not bound by the 20% agent rule — Phase C caps still apply.
      void cap;
    }
    return {
      mode,
      settings,
      mayExecute: true,
      mustQueue: false,
      reason: "Human operator authorized",
    };
  }

  // Previously human-approved scheduled posts may fire even in approval mode;
  // kill switch + compliance still apply (checked above / below).
  if (mode === "approval" && input.action !== "content_schedule") {
    const result: AuthorizeAgentActionResult = {
      mode,
      settings,
      mayExecute: false,
      mustQueue: true,
      reason: `Brand is in approval mode for ${input.channel}; queue for human review.`,
    };
    if (!input.allowAsRecommendation) {
      await writeAuditEvent({
        organizationId: input.organizationId,
        actorUserId: null,
        action: "agent_action_queued",
        entityType: input.entityType ?? input.channel,
        entityId: input.entityId ?? null,
        summary: result.reason,
        meta: {
          actor: "agent",
          actor_name: agentName,
          action: input.action,
          channel: input.channel,
          brand_id: input.brandId,
        },
      });
    }
    return result;
  }

  // Autonomous mode (or content_schedule of a human-approved item)
  if (input.channel === "ads" && input.platform && AD_ACTION_MAP[input.action]) {
    const { adsWritesEnabled } = await import("@/lib/ads/providers/types");
    // When platform writes are disabled, still allow local DB status changes for
    // safety pauses; remote mutate paths call authorizeAdWrite themselves.
    if (adsWritesEnabled(input.platform)) {
      await authorizeAdWrite({
        organizationId: input.organizationId,
        brandId: input.brandId,
        platform: input.platform,
        action: AD_ACTION_MAP[input.action]!,
        campaignId: input.campaignId,
        actorUserId: null,
        actorName: agentName,
        currentDailyBudgetPence: input.currentDailyBudgetPence,
        proposedDailyBudgetPence: input.proposedDailyBudgetPence,
      });
    } else if (
      input.action === "ads_activate" ||
      input.action === "ads_budget_update" ||
      input.action === "ads_create_paused"
    ) {
      throw new Error(
        `${input.platform} writes are disabled; cannot execute ${input.action} remotely.`,
      );
    }

    if (
      input.action === "ads_budget_update" &&
      input.currentDailyBudgetPence != null &&
      input.proposedDailyBudgetPence != null &&
      input.proposedDailyBudgetPence > input.currentDailyBudgetPence
    ) {
      const max = maxAllowedBudgetIncrease(input.currentDailyBudgetPence);
      if (input.proposedDailyBudgetPence > max) {
        const reason = `Autonomous budget increases are capped at 20%/day (max ${max}p from ${input.currentDailyBudgetPence}p).`;
        await writeAuditEvent({
          organizationId: input.organizationId,
          actorUserId: null,
          action: "agent_action_blocked",
          entityType: "ad_campaign",
          entityId: input.campaignId ?? null,
          summary: reason,
          meta: {
            actor: "agent",
            actor_name: agentName,
            action: input.action,
            brand_id: input.brandId,
          },
        });
        throw new Error(reason);
      }
    }
  }

  if (
    (input.action === "organic_publish" || input.action === "content_schedule") &&
    input.complianceStatus === "fail"
  ) {
    const result: AuthorizeAgentActionResult = {
      mode,
      settings,
      mayExecute: false,
      mustQueue: true,
      reason:
        "Compliance fail findings require human approval even in autonomous mode.",
    };
    await writeAuditEvent({
      organizationId: input.organizationId,
      actorUserId: null,
      action: "agent_action_queued",
      entityType: input.entityType ?? "content",
      entityId: input.entityId ?? null,
      summary: result.reason,
      meta: {
        actor: "agent",
        actor_name: agentName,
        action: input.action,
        channel: input.channel,
        brand_id: input.brandId,
        compliance_status: input.complianceStatus,
      },
    });
    return result;
  }

  return {
    mode,
    settings,
    mayExecute: true,
    mustQueue: false,
    reason: "Autonomous mode authorized",
  };
}

/** Persist audit + notify admins after a successful autonomous execution. */
export async function recordAutonomousAction(params: {
  organizationId: string;
  brandId: string;
  agentName: string;
  action: AgentActionKind;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  link?: string;
}) {
  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: null,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? null,
    summary: params.summary,
    before: params.before ?? null,
    after: params.after ?? null,
    meta: {
      actor: "agent",
      actor_name: params.agentName,
      brand_id: params.brandId,
    },
  });

  try {
    await notifyOrgAdmins({
      organizationId: params.organizationId,
      title: `Agent action: ${params.agentName}`,
      body: params.summary,
      link: params.link,
      category: "anomalies",
    });
  } catch {
    // Non-blocking
  }
}
