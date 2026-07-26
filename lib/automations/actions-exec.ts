import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { notifyUser } from "@/lib/planning/materialize";
import { getAdsProvider } from "@/lib/ads/providers";
import { adsWritesEnabled } from "@/lib/ads/providers/types";
import {
  canAutoPublish,
  getBrandAutomationSettings,
  reserveAutomationBudget,
} from "@/lib/automations/safety";
import type { Automation, AutomationAction } from "@/lib/types/automations";
import type { AdCampaign, AdConnection, AdPlatform } from "@/lib/types/ads";
import type { CampaignTaskModule } from "@/lib/types/planning";

export type ActionResult = {
  type: string;
  ok: boolean;
  detail: string;
  routed_to_approval?: boolean;
  skipped?: boolean;
};

async function orgAdminUserIds(organizationId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("role", ["org_owner", "org_admin"])
    .limit(10);
  return (data ?? []).map((m) => m.user_id);
}

export async function executeAutomationAction(params: {
  automation: Automation;
  action: AutomationAction;
  triggerData: Record<string, unknown>;
  dryRun?: boolean;
}): Promise<ActionResult> {
  const { automation, action, triggerData, dryRun } = params;
  const settings = await getBrandAutomationSettings({
    organizationId: automation.organization_id,
    brandId: automation.brand_id,
  });
  const supabase = createAdminClient();

  if (dryRun) {
    return {
      type: action.type,
      ok: true,
      detail: `Dry-run: would execute ${action.type}`,
      skipped: true,
    };
  }

  switch (action.type) {
    case "run_agent": {
      const agent = action.agent ?? "content_batch";
      if (agent === "content_batch") {
        const auto = canAutoPublish(settings, "content");
        const start = new Date();
        const end = new Date();
        end.setUTCDate(end.getUTCDate() + 13);
        const { data: run } = await supabase
          .from("agent_runs")
          .insert({
            organization_id: automation.organization_id,
            module: "content",
            agent_name: "content_batch_plan",
            status: "queued",
            input: { source: "automation", automationId: automation.id },
            logs: [
              { at: new Date().toISOString(), message: "Queued by automation" },
            ],
            progress: 0,
          })
          .select("id")
          .single();
        if (!run) {
          return { type: action.type, ok: false, detail: "Failed to create agent run" };
        }
        const { data: plan } = await supabase
          .from("content_plans")
          .insert({
            organization_id: automation.organization_id,
            brand_id: automation.brand_id,
            title: `Automation: ${automation.name}`,
            status: "draft",
            start_date: start.toISOString().slice(0, 10),
            end_date: end.toISOString().slice(0, 10),
            brief: {
              notes:
                action.brief ??
                `Automation "${automation.name}" content batch`,
            },
            agent_run_id: run.id,
          })
          .select("id")
          .single();
        if (!plan) {
          return { type: action.type, ok: false, detail: "Failed to create content plan" };
        }
        await inngest.send({
          name: "content/generate.batch-propose",
          data: {
            planId: plan.id,
            agentRunId: run.id,
            organizationId: automation.organization_id,
            brandId: automation.brand_id,
          },
        });
        return {
          type: action.type,
          ok: true,
          detail: `Queued content plan ${plan.id} (outputs enter approvals unless auto-publish)`,
          routed_to_approval: !auto,
        };
      }
      if (agent === "email_draft") {
        const auto = canAutoPublish(settings, "email");
        const { data: campaign } = await supabase
          .from("email_campaigns")
          .insert({
            organization_id: automation.organization_id,
            brand_id: automation.brand_id,
            name: `Automation: ${automation.name}`,
            subject: "Draft from automation",
            html_content: "",
            plain_text: "",
            status: "draft",
            brief: action.brief ?? automation.description ?? automation.name,
            list_ids: [],
            subject_variants: [],
            ab_test: false,
            stats: {},
          })
          .select("id")
          .single();
        return {
          type: action.type,
          ok: Boolean(campaign),
          detail: campaign
            ? `Created email draft ${campaign.id}`
            : "Failed to create email draft",
          routed_to_approval: !auto,
        };
      }
      if (agent === "research_refresh") {
        const { data: source } = await supabase
          .from("research_projects")
          .select("*")
          .eq("organization_id", automation.organization_id)
          .eq("brand_id", automation.brand_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!source) {
          return {
            type: action.type,
            ok: false,
            detail: "No research project found for brand",
          };
        }
        const brief = {
          ...((source.brief ?? {}) as Record<string, unknown>),
          notes: `Automation refresh of ${source.title}`,
          refreshedFromId: source.id,
        };
        const { data: project } = await supabase
          .from("research_projects")
          .insert({
            organization_id: automation.organization_id,
            brand_id: automation.brand_id,
            type: source.type,
            status: "queued",
            title: `${source.title} (automation refresh)`,
            brief,
            refreshed_from_id: source.id,
          })
          .select("*")
          .single();
        if (!project) {
          return {
            type: action.type,
            ok: false,
            detail: "Failed to create research project",
          };
        }
        const { data: run } = await supabase
          .from("agent_runs")
          .insert({
            organization_id: automation.organization_id,
            module: "research",
            agent_name: source.type,
            status: "queued",
            input: brief,
            logs: [
              { at: new Date().toISOString(), message: "Queued by automation" },
            ],
            progress: 0,
            research_project_id: project.id,
          })
          .select("id")
          .single();
        if (!run) {
          return {
            type: action.type,
            ok: false,
            detail: "Failed to create research agent run",
          };
        }
        await supabase
          .from("research_projects")
          .update({ latest_agent_run_id: run.id })
          .eq("id", project.id);
        await inngest.send({
          name: "research/run.requested",
          data: { projectId: project.id, agentRunId: run.id },
        });
        return {
          type: action.type,
          ok: true,
          detail: `Research refresh queued (${project.id})`,
        };
      }
      return { type: action.type, ok: false, detail: "Unknown agent" };
    }

    case "notify": {
      const title = action.title ?? `Automation: ${automation.name}`;
      const body = action.body ?? "";
      const channels = action.channels ?? ["in_app"];
      const userIds = await orgAdminUserIds(automation.organization_id);
      if (channels.includes("in_app") || channels.includes("email")) {
        for (const userId of userIds) {
          await notifyUser({
            organizationId: automation.organization_id,
            userId,
            title,
            body,
            link: `/automations/${automation.id}`,
            category: "general",
            skipSlack: channels.includes("slack"),
          });
        }
      }
      if (channels.includes("slack") && settings.slack_webhook_url) {
        try {
          await fetch(settings.slack_webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: `*${title}*\n${body}` }),
          });
        } catch {
          return { type: action.type, ok: false, detail: "Slack webhook failed" };
        }
      }
      return {
        type: action.type,
        ok: true,
        detail: `Notified via ${channels.join(", ")}`,
      };
    }

    case "create_task": {
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", automation.organization_id)
        .eq("brand_id", automation.brand_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!campaign) {
        return {
          type: action.type,
          ok: false,
          detail: "No planning campaign found to attach task",
        };
      }
      const { data: task, error } = await supabase
        .from("campaign_tasks")
        .insert({
          organization_id: automation.organization_id,
          campaign_id: campaign.id,
          title: action.task_title ?? automation.name,
          description: action.task_description ?? null,
          module: (action.task_module as CampaignTaskModule | undefined) ?? "other",
          assignee_type: "human",
          status: "todo",
          sort_order: 0,
          linked_entity: {
            source: "automation",
            automation_id: automation.id,
          },
        })
        .select("id")
        .single();
      if (error || !task) {
        return {
          type: action.type,
          ok: false,
          detail: error?.message ?? "Failed to create task",
        };
      }
      return { type: action.type, ok: true, detail: `Created task ${task.id}` };
    }

    case "pause_ad_campaign":
    case "resume_ad_campaign": {
      const campaignId =
        action.campaign_id ||
        (action.use_trigger_campaign
          ? String(triggerData.campaign_id ?? "")
          : "");
      if (!campaignId) {
        return { type: action.type, ok: false, detail: "No campaign_id provided" };
      }
      const { data: campaign } = await supabase
        .from("ad_campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("organization_id", automation.organization_id)
        .maybeSingle();
      if (!campaign) {
        return { type: action.type, ok: false, detail: "Campaign not found" };
      }

      if (action.type === "resume_ad_campaign") {
        const impact =
          action.budget_impact_pence ?? campaign.daily_budget_pence ?? 10_000;
        const reserved = await reserveAutomationBudget({
          organizationId: automation.organization_id,
          brandId: automation.brand_id,
          amountPence: impact,
          capPence: settings.daily_budget_action_cap_pence,
        });
        if (!reserved.allowed) {
          return {
            type: action.type,
            ok: false,
            detail: `Daily automation budget cap reached (£${(settings.daily_budget_action_cap_pence / 100).toFixed(0)})`,
            skipped: true,
          };
        }
        if (!canAutoPublish(settings, "ads")) {
          return {
            type: action.type,
            ok: true,
            detail:
              "Resume blocked by auto-publish rails — enable ads auto-publish",
            routed_to_approval: true,
          };
        }
      }

      const {
        authorizeAgentAction,
        recordAutonomousAction,
      } = await import("@/lib/autonomy/authorize");
      const { authorizeAdWrite, auditAdWrite } = await import(
        "@/lib/ads/write-safety"
      );
      const { ensureFreshAdAccessToken } = await import(
        "@/lib/ads/connections"
      );
      const adAction =
        action.type === "pause_ad_campaign" ? "ads_pause" : "ads_activate";
      const writeAction =
        action.type === "pause_ad_campaign" ? "pause" : "activate";
      const nextStatus =
        action.type === "pause_ad_campaign" ? "paused" : "active";

      const auth = await authorizeAgentAction({
        organizationId: automation.organization_id,
        brandId: campaign.brand_id,
        channel: "ads",
        action: adAction,
        platform: campaign.platform as AdPlatform,
        campaignId: campaign.id,
        agentName: `automation:${automation.name}`,
        entityType: "ad_campaign",
        entityId: campaign.id,
        currentDailyBudgetPence: campaign.daily_budget_pence,
        allowAsRecommendation: true,
      });
      if (!auth.mayExecute) {
        return {
          type: action.type,
          ok: true,
          detail: auth.reason,
          routed_to_approval: auth.mustQueue,
          skipped: !auth.mustQueue,
        };
      }

      if (!campaign.platform_campaign_id) {
        await supabase
          .from("ad_campaigns")
          .update({ status: nextStatus })
          .eq("id", campaignId);
        return {
          type: action.type,
          ok: true,
          detail: `${nextStatus} local-only campaign ${campaignId} (no platform_campaign_id)`,
        };
      }

      if (!adsWritesEnabled(campaign.platform as AdPlatform)) {
        return {
          type: action.type,
          ok: false,
          detail: `Remote ${writeAction} blocked: ADS_WRITES_ENABLED / platform flag off`,
        };
      }

      await authorizeAdWrite({
        organizationId: automation.organization_id,
        brandId: campaign.brand_id,
        platform: campaign.platform as AdPlatform,
        action: writeAction,
        campaignId: campaign.id,
        actorUserId: null,
        actorName: `automation:${automation.name}`,
        currentDailyBudgetPence: campaign.daily_budget_pence,
      });

      if (!campaign.connection_id) {
        return {
          type: action.type,
          ok: false,
          detail: "Campaign has no ad connection_id",
        };
      }
      const { data: connectionRow } = await supabase
        .from("ad_connections")
        .select("*")
        .eq("id", campaign.connection_id)
        .maybeSingle();
      if (!connectionRow) {
        return {
          type: action.type,
          ok: false,
          detail: "Ad connection missing for campaign",
        };
      }
      const fresh = await ensureFreshAdAccessToken(
        connectionRow as AdConnection,
      );
      const provider = getAdsProvider(campaign.platform as AdPlatform);
      const typedCampaign = campaign as AdCampaign;
      await provider.setCampaignStatus({
        accessToken: fresh.accessToken,
        accountId: fresh.connection.account_id,
        platformCampaignId: typedCampaign.platform_campaign_id!,
        status: nextStatus === "active" ? "active" : "paused",
        metadata: {
          ...(fresh.connection.metadata ?? {}),
          ...(typedCampaign.platform_metadata ?? {}),
          platform_adset_id: typedCampaign.platform_adset_id,
          platform_ad_id: typedCampaign.platform_ad_id,
        },
      });

      await supabase
        .from("ad_campaigns")
        .update({ status: nextStatus })
        .eq("id", campaignId);

      await auditAdWrite({
        organizationId: automation.organization_id,
        actorUserId: null,
        actorName: `automation:${automation.name}`,
        campaign: typedCampaign,
        action:
          action.type === "pause_ad_campaign"
            ? "ad_campaign_pause"
            : "ad_campaign_activate",
        before: { status: typedCampaign.status },
        after: { status: nextStatus },
      });
      await recordAutonomousAction({
        organizationId: automation.organization_id,
        brandId: typedCampaign.brand_id,
        agentName: `automation:${automation.name}`,
        action: adAction,
        entityType: "ad_campaign",
        entityId: typedCampaign.id,
        summary: `${nextStatus} campaign ${typedCampaign.name} via automation`,
        before: { status: typedCampaign.status },
        after: { status: nextStatus },
        link: `/ads/campaigns/${typedCampaign.id}`,
      });

      return {
        type: action.type,
        ok: true,
        detail: `${nextStatus} campaign ${campaignId} on ${typedCampaign.platform}`,
      };
    }

    case "add_contact_tag": {
      const contactId = String(triggerData.contact_id ?? "");
      const tag = action.tag?.trim();
      if (!contactId || !tag) {
        return {
          type: action.type,
          ok: false,
          detail: "contact_id and tag required",
        };
      }
      const { data: contact } = await supabase
        .from("crm_contacts")
        .select("id, tags")
        .eq("id", contactId)
        .eq("organization_id", automation.organization_id)
        .maybeSingle();
      if (!contact) {
        return { type: action.type, ok: false, detail: "Contact not found" };
      }
      const tags = Array.from(new Set([...(contact.tags ?? []), tag]));
      await supabase.from("crm_contacts").update({ tags }).eq("id", contactId);
      return {
        type: action.type,
        ok: true,
        detail: `Tagged contact with "${tag}"`,
      };
    }

    case "send_email_campaign": {
      const campaignId = action.email_campaign_id;
      if (!campaignId) {
        return {
          type: action.type,
          ok: false,
          detail: "email_campaign_id required",
        };
      }
      if (!canAutoPublish(settings, "email")) {
        return {
          type: action.type,
          ok: true,
          detail:
            "Send blocked — email auto-publish disabled; schedule after approval",
          routed_to_approval: true,
        };
      }
      const {
        authorizeAgentAction,
      } = await import("@/lib/autonomy/authorize");
      const auth = await authorizeAgentAction({
        organizationId: automation.organization_id,
        brandId: automation.brand_id,
        channel: "email",
        action: "email_send",
        agentName: `automation:${automation.name}`,
        entityType: "email_campaign",
        entityId: campaignId,
        allowAsRecommendation: true,
      });
      if (!auth.mayExecute) {
        return {
          type: action.type,
          ok: true,
          detail: auth.reason,
          routed_to_approval: auth.mustQueue,
          skipped: !auth.mustQueue,
        };
      }
      if (action.segment_id) {
        await supabase
          .from("email_campaigns")
          .update({ segment_id: action.segment_id })
          .eq("id", campaignId);
      }
      await inngest.send({
        name: "email/campaign.send",
        data: { campaignId },
      });
      return {
        type: action.type,
        ok: true,
        detail: `Queued send for campaign ${campaignId}`,
      };
    }

    case "outbound_webhook": {
      if (!action.url) {
        return { type: action.type, ok: false, detail: "url required" };
      }
      const {
        authorizeAgentAction,
        recordAutonomousAction,
      } = await import("@/lib/autonomy/authorize");
      const auth = await authorizeAgentAction({
        organizationId: automation.organization_id,
        brandId: automation.brand_id,
        channel: "content",
        action: "outbound_webhook",
        agentName: `automation:${automation.name}`,
        entityType: "automation",
        entityId: automation.id,
        allowAsRecommendation: true,
      });
      if (!auth.mayExecute) {
        return {
          type: action.type,
          ok: true,
          detail: auth.reason,
          routed_to_approval: auth.mustQueue,
          skipped: !auth.mustQueue,
        };
      }
      const res = await fetch(action.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          automation_id: automation.id,
          automation_name: automation.name,
          organization_id: automation.organization_id,
          brand_id: automation.brand_id,
          trigger_data: triggerData,
          at: new Date().toISOString(),
        }),
      });
      await recordAutonomousAction({
        organizationId: automation.organization_id,
        brandId: automation.brand_id,
        agentName: `automation:${automation.name}`,
        action: "outbound_webhook",
        entityType: "automation",
        entityId: automation.id,
        summary: `Outbound webhook ${res.status} to ${action.url}`,
        after: { status: res.status, url: action.url },
      });
      return { type: action.type, ok: res.ok, detail: `Webhook ${res.status}` };
    }

    default:
      return { type: action.type, ok: false, detail: "Unknown action type" };
  }
}
