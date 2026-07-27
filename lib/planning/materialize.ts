import { createAdminClient } from "@/lib/supabase/admin";
import type {
  CampaignTaskModule,
  MarketingPlan,
  PlanDocument,
  PlanDocumentTask,
} from "@/lib/types/planning";

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function logCampaignActivity(params: {
  organizationId: string;
  campaignId: string;
  taskId?: string | null;
  actorType?: string;
  actorId?: string | null;
  message: string;
  meta?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  await supabase.from("campaign_activities").insert({
    organization_id: params.organizationId,
    campaign_id: params.campaignId,
    task_id: params.taskId ?? null,
    actor_type: params.actorType ?? "system",
    actor_id: params.actorId ?? null,
    message: params.message,
    meta: params.meta ?? {},
  });
}

export async function notifyUser(params: {
  organizationId: string;
  userId: string;
  title: string;
  body?: string;
  link?: string;
  category?: import("@/lib/types/platform").NotificationCategory;
  skipSlack?: boolean;
}) {
  const { notifyUser: send } = await import("@/lib/notifications/notify");
  await send(params);
}

/** Prefill executing modules and return linked_entity payload. */
export async function linkTaskToModule(params: {
  organizationId: string;
  brandId: string;
  campaignId: string;
  campaignName: string;
  task: {
    id: string;
    title: string;
    description: string | null;
    module: CampaignTaskModule;
  };
  userId?: string | null;
}) {
  const supabase = createAdminClient();
  const brief = `${params.task.title}\n\n${params.task.description ?? ""}`.trim();

  switch (params.task.module) {
    case "content": {
      const { getBrandEnabledContentPlatforms } = await import(
        "@/lib/brand/channels"
      );
      const platforms = await getBrandEnabledContentPlatforms({
        organizationId: params.organizationId,
        brandId: params.brandId,
        admin: true,
      });
      const platform = platforms[0] ?? "facebook";

      const { data: run } = await supabase
        .from("agent_runs")
        .insert({
          organization_id: params.organizationId,
          module: "content",
          agent_name: "content_single_post",
          status: "queued",
          input: {
            brief,
            from_planning_task: params.task.id,
            campaign_id: params.campaignId,
            platform,
          },
          logs: [
            {
              at: new Date().toISOString(),
              message: `Queued from planning task (${platform})`,
            },
          ],
          progress: 0,
        })
        .select("id")
        .single();
      return {
        type: "content_agent_run",
        id: run?.id ?? null,
        module: "content",
        href: "/content/generate",
      };
    }
    case "ads": {
      const { data: plan } = await supabase
        .from("ad_media_plans")
        .insert({
          organization_id: params.organizationId,
          brand_id: params.brandId,
          name: `Plan: ${params.task.title}`.slice(0, 120),
          goal_brief: brief,
          monthly_budget_pence: 100000,
          currency: "GBP",
          objective: "purchases",
          plan: {
            summary: brief,
            platform_split: [],
            funnel_stages: [],
            campaigns: [],
            creative_brief: brief,
            risks: [],
          },
          status: "draft",
          created_by: params.userId ?? null,
        })
        .select("id")
        .single();
      return {
        type: "ad_media_plan",
        id: plan?.id ?? null,
        module: "ads",
        href: plan?.id ? `/ads/plans/${plan.id}` : "/ads/plans",
      };
    }
    case "email": {
      const { data: campaign } = await supabase
        .from("email_campaigns")
        .insert({
          organization_id: params.organizationId,
          brand_id: params.brandId,
          name: params.task.title.slice(0, 120),
          subject: "",
          brief,
          status: "draft",
          created_by: params.userId ?? null,
        })
        .select("id")
        .single();
      return {
        type: "email_campaign",
        id: campaign?.id ?? null,
        module: "email",
        href: campaign?.id ? `/email/campaigns/${campaign.id}` : "/email/campaigns",
      };
    }
    case "seo": {
      const { data: project } = await supabase
        .from("seo_projects")
        .select("id, domain")
        .eq("organization_id", params.organizationId)
        .eq("brand_id", params.brandId)
        .limit(1)
        .maybeSingle();

      if (!project) {
        return {
          type: "seo_pending_project",
          id: null,
          module: "seo",
          href: "/seo",
          note: "Create an SEO project to attach briefs",
        };
      }

      const keyword = params.task.title.replace(/^seo[:\s-]*/i, "").slice(0, 80) ||
        params.campaignName;
      const { data: kw } = await supabase
        .from("seo_keywords")
        .upsert(
          {
            organization_id: params.organizationId,
            project_id: project.id,
            keyword,
            intent: "commercial",
            priority: "high",
            tracked: true,
          },
          { onConflict: "project_id,keyword" },
        )
        .select("id")
        .single();

      const { data: seoBrief } = await supabase
        .from("seo_content_briefs")
        .insert({
          organization_id: params.organizationId,
          project_id: project.id,
          keyword_id: kw!.id,
          title: params.task.title,
          brief_markdown: brief,
          outline: [],
          entities: [],
          internal_links: [],
          target_word_count: 1200,
          search_intent: "commercial",
          status: "draft",
          created_by: params.userId ?? null,
        })
        .select("id")
        .single();

      return {
        type: "seo_brief",
        id: seoBrief?.id ?? null,
        keyword_id: kw?.id ?? null,
        module: "seo",
        href: seoBrief?.id ? `/seo/briefs/${seoBrief.id}` : `/seo/projects/${project.id}`,
      };
    }
    default:
      return {
        type: "manual",
        id: null,
        module: params.task.module,
        href: `/planning/campaigns/${params.campaignId}`,
      };
  }
}

export async function materializePlan(params: {
  plan: MarketingPlan;
  userId: string;
}) {
  const supabase = createAdminClient();
  const doc = params.plan.document as PlanDocument;
  const keyToCampaignId = new Map<string, string>();

  let sort = 0;
  for (const c of doc.campaigns ?? []) {
    const start = addDays(params.plan.period_start, c.start_offset_days);
    const end = addDays(start, Math.max(c.duration_days - 1, 0));
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        organization_id: params.plan.organization_id,
        brand_id: params.plan.brand_id,
        plan_id: params.plan.id,
        name: c.name,
        goal: c.goal,
        kpi: c.kpis ?? [],
        budget_pence: c.budget_pence,
        currency: params.plan.currency,
        start_date: start,
        end_date: end,
        channels: c.channels,
        status: "planned",
        sort_order: sort++,
        created_by: params.userId,
      })
      .select("id")
      .single();
    if (error || !campaign) throw new Error(error?.message ?? "Failed to create campaign");
    keyToCampaignId.set(c.key, campaign.id);
    await logCampaignActivity({
      organizationId: params.plan.organization_id,
      campaignId: campaign.id,
      actorType: "user",
      actorId: params.userId,
      message: "Campaign created from approved marketing plan",
    });
  }

  let taskSort = 0;
  for (const task of doc.task_breakdown ?? []) {
    const campaignId = keyToCampaignId.get(task.campaign_key);
    if (!campaignId) continue;
    const due = addDays(params.plan.period_start, task.due_offset_days);
    const { data: row, error } = await supabase
      .from("campaign_tasks")
      .insert({
        organization_id: params.plan.organization_id,
        campaign_id: campaignId,
        title: task.title,
        description: task.description,
        module: task.module,
        assignee_type: task.assignee_type,
        assignee_id: task.assignee_type === "human" ? params.userId : null,
        status: "todo",
        due_date: due,
        sort_order: taskSort++,
        linked_entity: {},
      })
      .select("*")
      .single();
    if (error || !row) continue;

    const linked = await linkTaskToModule({
      organizationId: params.plan.organization_id,
      brandId: params.plan.brand_id,
      campaignId,
      campaignName:
        doc.campaigns.find((c) => c.key === task.campaign_key)?.name ?? "Campaign",
      task: {
        id: row.id,
        title: row.title,
        description: row.description,
        module: row.module,
      },
      userId: params.userId,
    });

    await supabase
      .from("campaign_tasks")
      .update({ linked_entity: linked })
      .eq("id", row.id);

    await logCampaignActivity({
      organizationId: params.plan.organization_id,
      campaignId,
      taskId: row.id,
      actorType: "system",
      message: `Task created: ${row.title}`,
      meta: { linked },
    });

    if (task.assignee_type === "human") {
      await notifyUser({
        organizationId: params.plan.organization_id,
        userId: params.userId,
        title: `New planning task: ${task.title}`,
        body: task.description,
        link: `/planning/campaigns/${campaignId}`,
        category: "approvals",
      });
    }
  }

  await supabase
    .from("marketing_plans")
    .update({
      status: "active",
      approved_by: params.userId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", params.plan.id);

  return { campaigns: keyToCampaignId.size };
}

export type ExecutableTask = PlanDocumentTask & {
  id: string;
  organization_id: string;
  campaign_id: string;
  brand_id: string;
  linked_entity: Record<string, unknown>;
};
