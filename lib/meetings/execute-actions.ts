import "server-only";

import {
  authorizeAgentAction,
  recordAutonomousAction,
} from "@/lib/autonomy/authorize";
import { applyRecommendation } from "@/lib/ads/recommendations";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  MeetingActionItem,
  MeetingActionOutcome,
  MeetingTypedAction,
} from "@/lib/types/meetings";

function asTyped(action: MeetingActionItem): MeetingTypedAction {
  return action.action_type ?? "note";
}

/**
 * Execute typed meeting actions through authorizeAgentAction.
 * Returns partitioned taken vs awaiting-approval outcomes.
 */
export async function executeMeetingActions(params: {
  organizationId: string;
  brandId: string;
  meetingId: string;
  actions: MeetingActionItem[];
}): Promise<{
  taken: MeetingActionOutcome[];
  awaiting: MeetingActionOutcome[];
}> {
  const supabase = createAdminClient();
  const taken: MeetingActionOutcome[] = [];
  const awaiting: MeetingActionOutcome[] = [];

  for (let i = 0; i < params.actions.length; i += 1) {
    const action = params.actions[i]!;
    const actionType = asTyped(action);
    const payload = action.payload ?? {};

    // Persist / refresh meeting_actions row fields
    const { data: row } = await supabase
      .from("meeting_actions")
      .select("id")
      .eq("meeting_id", params.meetingId)
      .eq("sort_order", i)
      .maybeSingle();

    const updateRow = async (
      execution_status: MeetingActionOutcome["status"],
      execution_result: string,
    ) => {
      if (!row?.id) return;
      await supabase
        .from("meeting_actions")
        .update({
          action_type: actionType,
          payload,
          execution_status,
          execution_result,
          status:
            execution_status === "executed"
              ? "done"
              : execution_status === "queued_approval"
                ? "open"
                : "open",
        })
        .eq("id", row.id);
    };

    if (actionType === "note" || actionType === "flag_risk") {
      const outcome: MeetingActionOutcome = {
        description: action.description,
        action_type: actionType,
        status: "queued_approval",
        detail:
          actionType === "flag_risk"
            ? "Risk flagged for human review"
            : "Note recorded — no automatic execution",
      };
      awaiting.push(outcome);
      await updateRow("queued_approval", outcome.detail ?? "");
      continue;
    }

    if (actionType === "change_content_mix") {
      // Enrich next content plan brief when present; always propose in approval mode
      const auth = await authorizeAgentAction({
        organizationId: params.organizationId,
        brandId: params.brandId,
        channel: "organic_social",
        action: "growth_execute",
        agentName: "meeting_agent",
        entityType: "meeting",
        entityId: params.meetingId,
        allowAsRecommendation: true,
      });
      if (!auth.mayExecute) {
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "queued_approval",
          detail: auth.reason,
        };
        awaiting.push(outcome);
        await updateRow("queued_approval", auth.reason);
        continue;
      }

      const notes = String(
        payload.content_mix_notes ?? action.description,
      ).slice(0, 2000);
      const { data: plan } = await supabase
        .from("content_plans")
        .select("id, brief")
        .eq("organization_id", params.organizationId)
        .eq("brand_id", params.brandId)
        .in("status", ["draft", "proposed"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (plan) {
        const prior = (plan.brief as { notes?: string } | null) ?? {};
        await supabase
          .from("content_plans")
          .update({
            brief: {
              ...prior,
              notes: `${prior.notes ?? ""}\n\n## Meeting content-mix action\n${notes}`.trim(),
              meeting_id: params.meetingId,
            },
          })
          .eq("id", plan.id);
        await recordAutonomousAction({
          organizationId: params.organizationId,
          brandId: params.brandId,
          agentName: "meeting_agent",
          action: "growth_execute",
          entityType: "content_plan",
          entityId: plan.id,
          summary: `Meeting updated content mix brief: ${notes.slice(0, 160)}`,
          link: `/content/plans/${plan.id}`,
        });
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "executed",
          detail: `Updated content plan ${plan.id}`,
        };
        taken.push(outcome);
        await updateRow("executed", outcome.detail ?? "");
      } else {
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "queued_approval",
          detail: "No draft/proposed content plan to update",
        };
        awaiting.push(outcome);
        await updateRow("queued_approval", outcome.detail ?? "");
      }
      continue;
    }

    if (actionType === "pause_campaign" || actionType === "shift_budget") {
      const campaignId = String(payload.campaign_id ?? "");
      if (!campaignId) {
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "failed",
          detail: "Missing campaign_id in action payload",
        };
        awaiting.push(outcome);
        await updateRow("failed", outcome.detail ?? "");
        continue;
      }

      const { data: campaign } = await supabase
        .from("ad_campaigns")
        .select("id, platform, daily_budget_pence, brand_id")
        .eq("id", campaignId)
        .eq("organization_id", params.organizationId)
        .maybeSingle();
      if (!campaign || campaign.brand_id !== params.brandId) {
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "failed",
          detail: "Campaign not found for this brand",
        };
        awaiting.push(outcome);
        await updateRow("failed", outcome.detail ?? "");
        continue;
      }

      const platform = campaign.platform as "meta" | "google" | "tiktok" | "x" | "bing";
      const currentBudget = campaign.daily_budget_pence ?? 0;
      const proposed =
        typeof payload.proposed_daily_budget_pence === "number"
          ? payload.proposed_daily_budget_pence
          : typeof payload.amount_pence === "number"
            ? currentBudget + payload.amount_pence
            : currentBudget;

      const agentAction =
        actionType === "pause_campaign" ? "ads_pause" : "ads_budget_update";
      const auth = await authorizeAgentAction({
        organizationId: params.organizationId,
        brandId: params.brandId,
        channel: "ads",
        action: agentAction,
        agentName: "meeting_agent",
        entityType: "ad_campaign",
        entityId: campaignId,
        platform,
        campaignId,
        currentDailyBudgetPence: currentBudget,
        proposedDailyBudgetPence:
          actionType === "shift_budget" ? proposed : null,
        allowAsRecommendation: true,
      });

      if (!auth.mayExecute) {
        // Queue as ad recommendation for human apply
        const recType =
          actionType === "pause_campaign" ? "pause_campaign" : "shift_budget";
        const { data: rec } = await supabase
          .from("ad_recommendations")
          .insert({
            organization_id: params.organizationId,
            brand_id: params.brandId,
            campaign_id: campaignId,
            recommendation_type: recType,
            title: action.description.slice(0, 160),
            rationale: `From meeting ${params.meetingId}: ${action.description}`,
            payload: {
              ...payload,
              campaign_id: campaignId,
              amount_pence:
                typeof payload.amount_pence === "number"
                  ? payload.amount_pence
                  : proposed - currentBudget,
              proposed_daily_budget_pence: proposed,
              source: "meeting",
              meeting_id: params.meetingId,
            },
            status: "pending",
          })
          .select("id")
          .single();
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "queued_approval",
          detail: rec?.id
            ? `Queued recommendation ${rec.id}: ${auth.reason}`
            : auth.reason,
        };
        awaiting.push(outcome);
        await updateRow("queued_approval", outcome.detail ?? "");
        continue;
      }

      try {
        // Create a transient recommendation and apply immediately
        const recType =
          actionType === "pause_campaign" ? "pause_campaign" : "shift_budget";
        const { data: rec, error: recError } = await supabase
          .from("ad_recommendations")
          .insert({
            organization_id: params.organizationId,
            brand_id: params.brandId,
            campaign_id: campaignId,
            recommendation_type: recType,
            title: action.description.slice(0, 160),
            rationale: `Autonomous meeting action ${params.meetingId}`,
            payload: {
              ...payload,
              campaign_id: campaignId,
              amount_pence:
                typeof payload.amount_pence === "number"
                  ? payload.amount_pence
                  : proposed - currentBudget,
              proposed_daily_budget_pence: proposed,
              source: "meeting",
              meeting_id: params.meetingId,
            },
            status: "pending",
          })
          .select("id")
          .single();
        if (recError || !rec) throw new Error(recError?.message ?? "Rec insert failed");

        await applyRecommendation({
          recommendationId: rec.id,
          organizationId: params.organizationId,
          fromAutoOptimise: true,
        });
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "executed",
          detail: `Applied via recommendation ${rec.id}`,
        };
        taken.push(outcome);
        await updateRow("executed", outcome.detail ?? "");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Execute failed";
        const outcome: MeetingActionOutcome = {
          description: action.description,
          action_type: actionType,
          status: "failed",
          detail: message,
        };
        awaiting.push(outcome);
        await updateRow("failed", message);
      }
      continue;
    }

    const outcome: MeetingActionOutcome = {
      description: action.description,
      action_type: actionType,
      status: "skipped",
      detail: "Unsupported action type",
    };
    awaiting.push(outcome);
    await updateRow("skipped", outcome.detail ?? "");
  }

  return { taken, awaiting };
}
