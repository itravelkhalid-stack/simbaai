import "server-only";

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { zodSchemaToToolInputSchema } from "@/lib/agents/claude-json";
import { getAgentById } from "@/lib/agents/registry";
import {
  authorizeAgentAction,
  recordAutonomousAction,
} from "@/lib/autonomy/authorize";
import { adsWritesEnabled } from "@/lib/ads/providers/types";
import { getAdsProvider } from "@/lib/ads/providers";
import { ensureFreshAdAccessToken } from "@/lib/ads/connections";
import { createAdDirectiveFromAsk } from "@/lib/ads/directives";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdCampaign, AdConnection } from "@/lib/types/ads";

export type AskToolContext = {
  organizationId: string;
  brandId: string;
  userId: string;
};

const queryAdsSchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
});

const queryContentSchema = z.object({
  days: z.number().int().min(1).max(90).default(14),
  limit: z.number().int().min(1).max(40).default(20),
});

const queryKpisSchema = z.object({});

const queryFinanceSchema = z.object({
  days: z.number().int().min(1).max(90).default(30),
});

const queryMeetingsSchema = z.object({
  limit: z.number().int().min(1).max(20).default(8),
});

const queryComplianceSchema = z.object({
  limit: z.number().int().min(1).max(30).default(15),
});

const queryAgentRunsSchema = z.object({
  agent_name: z.string().optional(),
  limit: z.number().int().min(1).max(40).default(15),
});

const createTaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  due_date: z.string().optional(),
});

const runAgentSchema = z.object({
  agent_id: z.string().min(1),
});

const draftContentSchema = z.object({
  topic: z.string().min(3).max(300),
  platform: z
    .enum([
      "instagram",
      "linkedin",
      "tiktok",
      "facebook",
      "x",
      "youtube",
      "pinterest",
    ])
    .default("instagram"),
  format: z
    .enum(["post", "carousel", "reel_script", "story", "thread", "short_script"])
    .default("post"),
});

const pauseResumeSchema = z.object({
  campaign_id: z.string().uuid(),
  action: z.enum(["pause", "resume"]),
});

const createAdDirectiveSchema = z.object({
  scope: z.enum(["destination", "area", "hotel", "open"]),
  title: z.string().min(3).max(200),
  focus_text: z.string().min(3).max(500),
  destination_slug: z.string().max(120).optional(),
  budget_share_pct: z.number().min(1).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const ASK_FINAL_SCHEMA = z.object({
  answer_markdown: z.string().min(1),
  department: z.enum([
    "Executive",
    "Research",
    "Strategy & Planning",
    "Content",
    "Social",
    "Advertising",
    "SEO",
    "Email",
    "CRM",
    "Finance",
    "Data & Analytics",
    "Compliance",
    "Operations",
  ]),
  actions_summary: z
    .array(
      z.object({
        action: z.string(),
        status: z.enum(["executed", "queued_for_approval", "blocked", "info"]),
        detail: z.string(),
      }),
    )
    .default([]),
});

export type AskFinalResult = z.infer<typeof ASK_FINAL_SCHEMA>;

export function buildAskTools(): Anthropic.Messages.Tool[] {
  return [
    {
      name: "query_ads_metrics",
      description: "Advertising department: recent ad campaign metrics and spend.",
      input_schema: zodSchemaToToolInputSchema(queryAdsSchema),
    },
    {
      name: "query_content_calendar",
      description:
        "Content department: recent/scheduled content items and engagement metrics.",
      input_schema: zodSchemaToToolInputSchema(queryContentSchema),
    },
    {
      name: "query_kpi_actuals",
      description: "Executive / Reviews: brand KPI targets and latest actuals.",
      input_schema: zodSchemaToToolInputSchema(queryKpisSchema),
    },
    {
      name: "query_finance_rollups",
      description: "Finance department: expense and revenue rollups.",
      input_schema: zodSchemaToToolInputSchema(queryFinanceSchema),
    },
    {
      name: "query_meeting_history",
      description: "Executive: recent AI meetings and action counts.",
      input_schema: zodSchemaToToolInputSchema(queryMeetingsSchema),
    },
    {
      name: "query_compliance_findings",
      description: "Compliance: recent compliance check findings.",
      input_schema: zodSchemaToToolInputSchema(queryComplianceSchema),
    },
    {
      name: "query_agent_run_history",
      description: "Operations: recent agent_runs for this organisation.",
      input_schema: zodSchemaToToolInputSchema(queryAgentRunsSchema),
    },
    {
      name: "create_task",
      description: "Strategy: create a campaign task for follow-up work.",
      input_schema: zodSchemaToToolInputSchema(createTaskSchema),
    },
    {
      name: "run_agent",
      description:
        "Operations: queue or run a registered agent by registry id (e.g. ads-optimisation, report-weekly).",
      input_schema: zodSchemaToToolInputSchema(runAgentSchema),
    },
    {
      name: "draft_content",
      description:
        "Content: queue a single content generation job (enters approvals unless auto-publish).",
      input_schema: zodSchemaToToolInputSchema(draftContentSchema),
    },
    {
      name: "pause_resume_campaign",
      description:
        "Advertising: pause or resume a managed ad campaign (autonomy-gated).",
      input_schema: zodSchemaToToolInputSchema(pauseResumeSchema),
    },
    {
      name: "create_ad_directive",
      description:
        "Advertising: create an active campaign directive that binds the next media plan (destination / area / hotel / open).",
      input_schema: zodSchemaToToolInputSchema(createAdDirectiveSchema),
    },
  ];
}

function daysAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function executeAskTool(
  name: string,
  rawInput: unknown,
  ctx: AskToolContext,
): Promise<Record<string, unknown>> {
  const supabase = createAdminClient();

  switch (name) {
    case "query_ads_metrics": {
      const input = queryAdsSchema.parse(rawInput);
      const since = daysAgo(input.days);
      const { data: campaigns } = await supabase
        .from("ad_campaigns")
        .select("id, name, status, platform, daily_budget_pence")
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .limit(40);
      const ids = (campaigns ?? []).map((c) => c.id);
      const { data: metrics } = ids.length
        ? await supabase
            .from("ad_metrics_daily")
            .select(
              "campaign_id, metric_date, spend_pence, impressions, clicks, conversions, revenue_pence",
            )
            .eq("organization_id", ctx.organizationId)
            .in("campaign_id", ids)
            .gte("metric_date", since)
        : { data: [] };
      return {
        department: "Advertising",
        campaigns: campaigns ?? [],
        metrics: metrics ?? [],
      };
    }
    case "query_content_calendar": {
      const input = queryContentSchema.parse(rawInput);
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.days);
      const { data: items } = await supabase
        .from("content_items")
        .select(
          "id, title, platform, format, status, scheduled_at, published_at",
        )
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .order("updated_at", { ascending: false })
        .limit(input.limit);
      const itemIds = (items ?? []).map((i) => i.id);
      const { data: metrics } = itemIds.length
        ? await supabase
            .from("content_metrics")
            .select(
              "content_item_id, likes, comments, shares, saves, clicks, impressions, captured_at",
            )
            .eq("organization_id", ctx.organizationId)
            .in("content_item_id", itemIds)
            .gte("captured_at", since.toISOString())
            .limit(200)
        : { data: [] };
      return {
        department: "Content",
        items: items ?? [],
        metrics: metrics ?? [],
      };
    }
    case "query_kpi_actuals": {
      const { data: kpis } = await supabase
        .from("brand_kpis")
        .select(
          "metric_key, label, target_value, unit, channel, is_north_star",
        )
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .order("sort_order");
      const since = daysAgo(14);
      const { data: actuals } = await supabase
        .from("analytics_daily")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .gte("metric_date", since)
        .order("metric_date", { ascending: false })
        .limit(30);
      return {
        department: "Executive",
        kpis: kpis ?? [],
        analytics_daily: actuals ?? [],
      };
    }
    case "query_finance_rollups": {
      const input = queryFinanceSchema.parse(rawInput);
      const since = daysAgo(input.days);
      const { data: expenses } = await supabase
        .from("expenses")
        .select("channel, amount_pence, currency, expense_date, description")
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .gte("expense_date", since)
        .limit(200);
      const { data: revenue } = await supabase
        .from("revenue_records")
        .select("amount_pence, currency, revenue_date, source")
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .gte("revenue_date", since)
        .limit(200);
      const spend = (expenses ?? []).reduce(
        (s, e) => s + (e.amount_pence as number),
        0,
      );
      const rev = (revenue ?? []).reduce(
        (s, e) => s + (e.amount_pence as number),
        0,
      );
      return {
        department: "Finance",
        spend_pence: spend,
        revenue_pence: rev,
        expenses: expenses ?? [],
        revenue: revenue ?? [],
      };
    }
    case "query_meeting_history": {
      const input = queryMeetingsSchema.parse(rawInput);
      const { data: meetings } = await supabase
        .from("meetings")
        .select("id, type, title, status, scheduled_for")
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .order("scheduled_for", { ascending: false })
        .limit(input.limit);
      const ids = (meetings ?? []).map((m) => m.id);
      const { data: actions } = ids.length
        ? await supabase
            .from("meeting_actions")
            .select("meeting_id, status, description")
            .eq("organization_id", ctx.organizationId)
            .in("meeting_id", ids)
        : { data: [] };
      return {
        department: "Executive",
        meetings: meetings ?? [],
        actions: actions ?? [],
      };
    }
    case "query_compliance_findings": {
      const input = queryComplianceSchema.parse(rawInput);
      const { data } = await supabase
        .from("compliance_checks")
        .select(
          "id, entity_type, entity_id, status, findings, checked_at",
        )
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .order("checked_at", { ascending: false })
        .limit(input.limit);
      return { department: "Compliance", checks: data ?? [] };
    }
    case "query_agent_run_history": {
      const input = queryAgentRunsSchema.parse(rawInput);
      let q = supabase
        .from("agent_runs")
        .select(
          "id, agent_name, module, status, cost_pence, created_at, error",
        )
        .eq("organization_id", ctx.organizationId)
        .order("created_at", { ascending: false })
        .limit(input.limit);
      if (input.agent_name) q = q.eq("agent_name", input.agent_name);
      const { data } = await q;
      return { department: "Operations", runs: data ?? [] };
    }
    case "create_task": {
      const input = createTaskSchema.parse(rawInput);
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("organization_id", ctx.organizationId)
        .eq("brand_id", ctx.brandId)
        .in("status", ["active", "planned", "paused"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let campaignId = campaign?.id as string | undefined;
      if (!campaignId) {
        const { data: created, error } = await supabase
          .from("campaigns")
          .insert({
            organization_id: ctx.organizationId,
            brand_id: ctx.brandId,
            name: "Ask the Team follow-ups",
            goal: "Tasks created from Ask the Team",
            status: "active",
            channels: ["other"],
            created_by: ctx.userId,
          })
          .select("id")
          .single();
        if (error || !created) {
          return { ok: false, error: error?.message ?? "No campaign" };
        }
        campaignId = created.id;
      }

      const { data: task, error: taskError } = await supabase
        .from("campaign_tasks")
        .insert({
          organization_id: ctx.organizationId,
          campaign_id: campaignId,
          title: input.title,
          description: input.description ?? null,
          due_date: input.due_date || null,
          assignee_type: "human",
          assignee_id: ctx.userId,
          status: "todo",
          module: "other",
        })
        .select("id")
        .single();
      if (taskError || !task) {
        return { ok: false, error: taskError?.message ?? "Task failed" };
      }
      return {
        ok: true,
        department: "Strategy & Planning",
        status: "executed",
        task_id: task.id,
        href: `/planning/campaigns/${campaignId}`,
      };
    }
    case "run_agent": {
      const input = runAgentSchema.parse(rawInput);
      const entry = getAgentById(input.agent_id);
      if (!entry?.runNow) {
        return {
          ok: false,
          error:
            "Agent not found or not runnable on demand. Use registry ids with runNow support.",
        };
      }
      // Queue via Inngest / existing runners where possible; autonomy for outbound.
      if (entry.runNow.kind === "meeting" && entry.runNow.type) {
        const { createAndQueueMeeting } = await import("@/lib/meetings/run");
        const meeting = await createAndQueueMeeting({
          organizationId: ctx.organizationId,
          brandId: ctx.brandId,
          type: entry.runNow.type as
            | "daily_standup"
            | "weekly_marketing"
            | "monthly_board"
            | "quarterly_board"
            | "annual_review",
        });
        await inngest.send({
          name: "meetings/run",
          data: { meetingId: meeting.id },
        });
        return {
          ok: true,
          status: "executed",
          department: "Executive",
          meeting_id: meeting.id,
        };
      }
      if (entry.runNow.kind === "report" && entry.runNow.type) {
        const { createAndQueueReport } = await import("@/lib/reviews/run");
        const report = await createAndQueueReport({
          organizationId: ctx.organizationId,
          brandId: ctx.brandId,
          type: entry.runNow.type as
            | "daily"
            | "weekly"
            | "monthly"
            | "quarterly",
        });
        await inngest.send({
          name: "reviews/run",
          data: { reportId: report.id },
        });
        return {
          ok: true,
          status: "executed",
          department: "Executive",
          report_id: report.id,
        };
      }
      if (entry.runNow.kind === "ads_optimisation") {
        const { runDailyOptimisationForOrg } = await import(
          "@/lib/ads/optimisation"
        );
        const result = await runDailyOptimisationForOrg(ctx.organizationId);
        return {
          ok: true,
          status: "executed",
          department: "Advertising",
          ...result,
        };
      }
      if (entry.runNow.kind === "organic_growth") {
        const { runWeeklyGrowthReviewForBrand } = await import(
          "@/lib/content/growth"
        );
        await runWeeklyGrowthReviewForBrand({
          organizationId: ctx.organizationId,
          brandId: ctx.brandId,
        });
        return { ok: true, status: "executed", department: "Content" };
      }
      return {
        ok: false,
        error: `run_agent does not support kind ${entry.runNow.kind} from chat yet — use the Team page Run now button.`,
      };
    }
    case "draft_content": {
      const input = draftContentSchema.parse(rawInput);
      const auth = await authorizeAgentAction({
        organizationId: ctx.organizationId,
        brandId: ctx.brandId,
        channel: "content",
        action: "content_schedule",
        actorUserId: ctx.userId,
        agentName: "team_ask",
        summary: `Draft content: ${input.topic}`,
        allowAsRecommendation: true,
      });
      if (!auth.mayExecute && !auth.mustQueue) {
        return {
          ok: false,
          status: "blocked",
          reason: auth.reason,
          department: "Content",
        };
      }

      const { data: run, error: runError } = await supabase
        .from("agent_runs")
        .insert({
          organization_id: ctx.organizationId,
          module: "content",
          agent_name: "content_single_post",
          status: "queued",
          input: {
            brandId: ctx.brandId,
            platform: input.platform,
            format: input.format,
            topic: input.topic,
            via: "team_ask",
          },
          progress: 0,
        })
        .select("id")
        .single();
      if (runError || !run) {
        return { ok: false, error: runError?.message ?? "Queue failed" };
      }

      await inngest.send({
        name: "content/generate.single",
        data: {
          organizationId: ctx.organizationId,
          brandId: ctx.brandId,
          agentRunId: run.id,
          platform: input.platform,
          format: input.format,
          topic: input.topic,
          createdBy: ctx.userId,
        },
      });

      return {
        ok: true,
        department: "Content",
        status: auth.mustQueue ? "queued_for_approval" : "executed",
        agent_run_id: run.id,
        href: `/content/queue?run=${run.id}`,
        autonomy: auth.reason,
      };
    }
    case "pause_resume_campaign": {
      const input = pauseResumeSchema.parse(rawInput);
      const { data: campaignRow } = await supabase
        .from("ad_campaigns")
        .select("*")
        .eq("id", input.campaign_id)
        .eq("organization_id", ctx.organizationId)
        .single();
      if (!campaignRow) return { ok: false, error: "Campaign not found" };
      const campaign = campaignRow as AdCampaign;

      const actionKind =
        input.action === "pause" ? "ads_pause" : "ads_activate";
      const auth = await authorizeAgentAction({
        organizationId: ctx.organizationId,
        brandId: campaign.brand_id,
        channel: "ads",
        action: actionKind,
        actorUserId: ctx.userId,
        agentName: "team_ask",
        platform: campaign.platform,
        campaignId: campaign.id,
        currentDailyBudgetPence: campaign.daily_budget_pence,
        summary: `${input.action} campaign ${campaign.name}`,
        allowAsRecommendation: true,
      });

      if (auth.mustQueue || !auth.mayExecute) {
        const { data: rec } = await supabase
          .from("ad_recommendations")
          .insert({
            organization_id: ctx.organizationId,
            brand_id: campaign.brand_id,
            campaign_id: campaign.id,
            recommendation_type:
              input.action === "pause" ? "pause_campaign" : "activate_campaign",
            title: `${input.action === "pause" ? "Pause" : "Activate"} ${campaign.name}`,
            rationale: `Requested via Ask the Team: ${auth.reason}`,
            status: "pending",
            payload: { campaign_id: campaign.id, source: "team_ask" },
          })
          .select("id")
          .single();
        return {
          ok: true,
          department: "Advertising",
          status: auth.mayExecute ? "blocked" : "queued_for_approval",
          reason: auth.reason,
          recommendation_id: rec?.id,
          href: "/ads/approvals",
        };
      }

      let connection: AdConnection | null = null;
      if (campaign.connection_id) {
        const { data } = await supabase
          .from("ad_connections")
          .select("*")
          .eq("id", campaign.connection_id)
          .maybeSingle();
        connection = (data as AdConnection) ?? null;
      }

      if (
        connection &&
        campaign.platform_campaign_id &&
        adsWritesEnabled(campaign.platform)
      ) {
        const provider = getAdsProvider(campaign.platform);
        const { accessToken, connection: fresh } =
          await ensureFreshAdAccessToken(connection);
        const meta = {
          ...(fresh.metadata ?? {}),
          ...(campaign.platform_metadata ?? {}),
          platform_adset_id: campaign.platform_adset_id,
          platform_ad_id: campaign.platform_ad_id,
        };
        if (input.action === "pause") {
          await provider.pauseCampaign({
            accessToken,
            accountId: fresh.account_id,
            platformCampaignId: campaign.platform_campaign_id,
            metadata: meta,
          });
        } else {
          await provider.setCampaignStatus({
            accessToken,
            accountId: fresh.account_id,
            platformCampaignId: campaign.platform_campaign_id,
            status: "active",
            metadata: meta,
          });
        }
      }

      const nextStatus = input.action === "pause" ? "paused" : "active";
      await supabase
        .from("ad_campaigns")
        .update({ status: nextStatus })
        .eq("id", campaign.id);

      await recordAutonomousAction({
        organizationId: ctx.organizationId,
        brandId: campaign.brand_id,
        agentName: "team_ask",
        action: actionKind,
        entityType: "ad_campaign",
        entityId: campaign.id,
        summary: `${input.action} campaign ${campaign.name} via Ask the Team`,
        before: { status: campaign.status },
        after: { status: nextStatus },
        link: `/ads/campaigns/${campaign.id}`,
      });

      return {
        ok: true,
        department: "Advertising",
        status: "executed",
        campaign_id: campaign.id,
        new_status: nextStatus,
      };
    }
    case "create_ad_directive": {
      const input = createAdDirectiveSchema.parse(rawInput);
      const directiveId = await createAdDirectiveFromAsk({
        organizationId: ctx.organizationId,
        brandId: ctx.brandId,
        userId: ctx.userId,
        scope: input.scope,
        title: input.title,
        focusText: input.focus_text,
        destinationSlug: input.destination_slug ?? null,
        budgetSharePct: input.budget_share_pct ?? null,
        notes: input.notes ?? null,
      });
      return {
        ok: true,
        department: "Advertising",
        status: "executed",
        directive_id: directiveId,
        href: "/ads/directives",
      };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
