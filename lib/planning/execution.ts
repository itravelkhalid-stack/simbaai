import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import {
  generateSeoBrief,
  generateSeoArticle,
} from "@/lib/agents/seo/generate";
import { generateCampaignEmail } from "@/lib/agents/email/generate";
import { generateMediaPlan } from "@/lib/agents/ads/generate";
import { getBrandContext } from "@/lib/brand/context";
import {
  blocksToPlainText,
  renderEmailHtml,
} from "@/lib/email/blocks";
import { buildComplianceFooter } from "@/lib/email/footer";
import { scoreArticleAgainstBrief } from "@/lib/seo/checklist";
import { logCampaignActivity } from "@/lib/planning/materialize";
import type { Campaign, CampaignTask, PlanKpi } from "@/lib/types/planning";

export async function refreshCampaignKpis(campaign: Campaign) {
  const supabase = createAdminClient();
  const kpis = [...(campaign.kpi ?? [])] as PlanKpi[];
  let spent = campaign.spent_pence;

  // Pull ad spend for campaigns that include ads channel
  if (campaign.channels.some((c) => /ads?|meta|google|tiktok/i.test(c))) {
    const since = campaign.start_date ?? campaign.created_at.slice(0, 10);
    const { data: metrics } = await supabase
      .from("ad_metrics_daily")
      .select("spend_pence, conversions, revenue_pence")
      .eq("organization_id", campaign.organization_id)
      .gte("metric_date", since);
    const spend = (metrics ?? []).reduce((s, r) => s + (r.spend_pence ?? 0), 0);
    const conversions = (metrics ?? []).reduce(
      (s, r) => s + Number(r.conversions ?? 0),
      0,
    );
    const revenue = (metrics ?? []).reduce(
      (s, r) => s + (r.revenue_pence ?? 0),
      0,
    );
    spent = spend;
    for (const kpi of kpis) {
      if (/spend|budget/i.test(kpi.metric)) kpi.current = spend / 100;
      if (/conversion/i.test(kpi.metric)) kpi.current = conversions;
      if (/revenue|sales/i.test(kpi.metric)) kpi.current = revenue / 100;
      if (/roas/i.test(kpi.metric)) {
        kpi.current = spend > 0 ? revenue / spend : 0;
      }
    }
  }

  // Email engagement
  if (campaign.channels.some((c) => /email/i.test(c))) {
    const { data: emailCampaigns } = await supabase
      .from("email_campaigns")
      .select("stats")
      .eq("organization_id", campaign.organization_id)
      .limit(20);
    const opens = (emailCampaigns ?? []).reduce(
      (s, c) => s + Number((c.stats as Record<string, number>)?.opens ?? 0),
      0,
    );
    for (const kpi of kpis) {
      if (/open/i.test(kpi.metric)) kpi.current = opens;
    }
  }

  // SEO clicks
  if (campaign.channels.some((c) => /seo|search/i.test(c))) {
    const since = campaign.start_date ?? campaign.created_at.slice(0, 10);
    const { data: gsc } = await supabase
      .from("seo_gsc_daily")
      .select("clicks")
      .eq("organization_id", campaign.organization_id)
      .gte("metric_date", since);
    const clicks = (gsc ?? []).reduce((s, r) => s + (r.clicks ?? 0), 0);
    for (const kpi of kpis) {
      if (/click|traffic/i.test(kpi.metric)) kpi.current = clicks;
    }
  }

  await supabase
    .from("campaigns")
    .update({ kpi: kpis, spent_pence: spent })
    .eq("id", campaign.id);

  return { kpis, spent };
}

export async function executeAiTask(taskId: string) {
  const supabase = createAdminClient();
  const { data: task } = await supabase
    .from("campaign_tasks")
    .select("*")
    .eq("id", taskId)
    .single();
  if (!task) throw new Error("Task not found");
  if (task.assignee_type !== "ai") throw new Error("Not an AI task");

  const t = task as CampaignTask;
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", t.campaign_id)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  const { skipIfBrandAgentHalted } = await import("@/lib/brand/agent-halt");
  const halt = await skipIfBrandAgentHalted({
    organizationId: t.organization_id,
    brandId: campaign.brand_id,
  });
  if (halt) {
    await supabase
      .from("campaign_tasks")
      .update({
        status: "blocked",
        last_error: halt.message,
      })
      .eq("id", t.id);
    return { taskId: t.id, ...halt };
  }

  await supabase
    .from("campaign_tasks")
    .update({
      status: "in_progress",
      started_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", t.id);

  await logCampaignActivity({
    organizationId: t.organization_id,
    campaignId: t.campaign_id,
    taskId: t.id,
    actorType: "ai",
    message: `AI started: ${t.title}`,
  });

  try {
    const brandContext = await getBrandContext(
      t.organization_id,
      campaign.brand_id,
      { admin: true },
    );
    const brief = `${t.title}\n\n${t.description ?? ""}`.trim();
    let linked = { ...(t.linked_entity ?? {}) };

    if (t.module === "content") {
      let runId = linked.id as string | null;
      const topic = brief;
      const { getBrandEnabledContentPlatforms } = await import(
        "@/lib/brand/channels"
      );
      const platforms = await getBrandEnabledContentPlatforms({
        organizationId: t.organization_id,
        brandId: campaign.brand_id,
        admin: true,
      });
      const platform = platforms[0] ?? "facebook";
      if (!runId) {
        const { data: run } = await supabase
          .from("agent_runs")
          .insert({
            organization_id: t.organization_id,
            module: "content",
            agent_name: "content_single_post",
            status: "queued",
            input: {
              brief: topic,
              platform,
              format: "post",
              from_planning_task: t.id,
            },
            logs: [
              {
                at: new Date().toISOString(),
                message: `Queued by execution engine (${platform})`,
              },
            ],
            progress: 0,
          })
          .select("id")
          .single();
        runId = run?.id ?? null;
      }
      if (runId) {
        await inngest.send({
          name: "content/generate.single",
          data: {
            organizationId: t.organization_id,
            brandId: campaign.brand_id,
            agentRunId: runId,
            platform,
            format: "post",
            topic,
            createdBy: campaign.created_by ?? campaign.organization_id,
          },
        });
        linked = {
          type: "content_agent_run",
          id: runId,
          module: "content",
          href: "/content/queue",
        };
      }
    } else if (t.module === "ads") {
      const generated = await generateMediaPlan({
        brandContext,
        goalBrief: brief,
        monthlyBudgetPence: Math.max(campaign.budget_pence || 100000, 10000),
        currency: campaign.currency,
        objective: "purchases",
      });
      const planId = (linked.id as string | null) ?? null;
      if (planId) {
        await supabase
          .from("ad_media_plans")
          .update({
            plan: generated.data,
            name: generated.data.name,
            status: "pending_approval",
          })
          .eq("id", planId);
        linked = { ...linked, href: `/ads/plans/${planId}` };
      } else {
        const { data: plan } = await supabase
          .from("ad_media_plans")
          .insert({
            organization_id: t.organization_id,
            brand_id: campaign.brand_id,
            name: generated.data.name,
            goal_brief: brief,
            monthly_budget_pence: Math.max(campaign.budget_pence || 100000, 10000),
            currency: campaign.currency,
            plan: {
              summary: generated.data.summary,
              platform_split: generated.data.platform_split,
              funnel_stages: generated.data.funnel_stages,
              campaigns: generated.data.campaigns,
              creative_brief: generated.data.creative_brief,
              risks: generated.data.risks,
            },
            status: "pending_approval",
          })
          .select("id")
          .single();
        linked = {
          type: "ad_media_plan",
          id: plan?.id ?? null,
          module: "ads",
          href: plan?.id ? `/ads/plans/${plan.id}` : "/ads/plans",
        };
      }
    } else if (t.module === "email") {
      const generated = await generateCampaignEmail({ brandContext, brief });
      const footer = buildComplianceFooter({
        organizationId: t.organization_id,
        brandName: brandContext.organizationName,
        physicalAddress: "Address pending — set in Email settings",
        email: "preview@example.com",
      });
      const html = renderEmailHtml({
        preheader: generated.data.preheader,
        blocks: generated.data.blocks,
        footerHtml: footer.html,
        brandName: brandContext.organizationName,
      });
      const campaignId = (linked.id as string | null) ?? null;
      if (campaignId) {
        await supabase
          .from("email_campaigns")
          .update({
            subject: generated.data.subject_variants[0] ?? "",
            subject_variants: generated.data.subject_variants,
            preheader: generated.data.preheader,
            blocks: generated.data.blocks,
            html_content: html,
            plain_text: blocksToPlainText(generated.data.blocks, footer.text),
            status: "draft",
            brief,
          })
          .eq("id", campaignId);
        linked = { ...linked, href: `/email/campaigns/${campaignId}` };
      }
    } else if (t.module === "seo") {
      const briefId = linked.id as string | null;
      const keywordId = linked.keyword_id as string | null;
      if (briefId && keywordId) {
        const { data: keyword } = await supabase
          .from("seo_keywords")
          .select("*")
          .eq("id", keywordId)
          .single();
        const { data: briefRow } = await supabase
          .from("seo_content_briefs")
          .select("project_id")
          .eq("id", briefId)
          .single();
        const { data: project } = briefRow
          ? await supabase
              .from("seo_projects")
              .select("*")
              .eq("id", briefRow.project_id)
              .maybeSingle()
          : { data: null };

        if (keyword && project) {
          const generatedBrief = await generateSeoBrief({
            brandContext,
            keyword: keyword.keyword,
            intent: keyword.intent,
            domain: project.domain,
          });
          await supabase
            .from("seo_content_briefs")
            .update({
              title: generatedBrief.data.title,
              brief_markdown: generatedBrief.data.brief_markdown,
              outline: generatedBrief.data.outline,
              entities: generatedBrief.data.entities,
              internal_links: generatedBrief.data.internal_links,
              target_word_count: generatedBrief.data.target_word_count,
              search_intent: generatedBrief.data.search_intent,
              status: "ready",
            })
            .eq("id", briefId);

          const article = await generateSeoArticle({
            brandContext,
            briefMarkdown: generatedBrief.data.brief_markdown,
            keyword: keyword.keyword,
            outline: generatedBrief.data.outline,
            entities: generatedBrief.data.entities,
            targetWordCount: generatedBrief.data.target_word_count,
          });
          const checklist = scoreArticleAgainstBrief({
            title: article.data.title,
            contentMarkdown: article.data.content_markdown,
            brief: {
              title: generatedBrief.data.title,
              brief_markdown: generatedBrief.data.brief_markdown,
              outline: generatedBrief.data.outline,
              entities: generatedBrief.data.entities,
              internal_links: generatedBrief.data.internal_links,
              target_word_count: generatedBrief.data.target_word_count,
              search_intent: generatedBrief.data.search_intent,
            },
            keyword: keyword.keyword,
          });
          const { data: art } = await supabase
            .from("seo_articles")
            .insert({
              organization_id: t.organization_id,
              project_id: project.id,
              brief_id: briefId,
              title: article.data.title,
              content_markdown: article.data.content_markdown,
              status: "review",
              checklist_score: checklist.score,
              checklist,
            })
            .select("id")
            .single();
          linked = {
            ...linked,
            article_id: art?.id ?? null,
            href: art?.id ? `/seo/articles/${art.id}` : `/seo/briefs/${briefId}`,
          };
        }
      }
    }

    await supabase
      .from("campaign_tasks")
      .update({
        status: "in_review",
        linked_entity: linked,
        completed_at: new Date().toISOString(),
      })
      .eq("id", t.id);

    await logCampaignActivity({
      organizationId: t.organization_id,
      campaignId: t.campaign_id,
      taskId: t.id,
      actorType: "ai",
      message: `AI output ready for approval: ${t.title}`,
      meta: { linked },
    });

    return { ok: true, linked };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Execution failed";
    await supabase
      .from("campaign_tasks")
      .update({ status: "blocked", last_error: message })
      .eq("id", t.id);
    await logCampaignActivity({
      organizationId: t.organization_id,
      campaignId: t.campaign_id,
      taskId: t.id,
      actorType: "system",
      message: `AI task failed: ${message}`,
    });
    throw error;
  }
}

export async function runDueAiTasks(limit = 20) {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: tasks } = await supabase
    .from("campaign_tasks")
    .select("id")
    .eq("assignee_type", "ai")
    .eq("status", "todo")
    .or(`due_date.is.null,due_date.lte.${today}`)
    .order("due_date", { ascending: true, nullsFirst: true })
    .limit(limit);

  const results = [];
  for (const task of tasks ?? []) {
    try {
      await executeAiTask(task.id);
      results.push({ id: task.id, ok: true });
    } catch (error) {
      results.push({
        id: task.id,
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}

export async function refreshAllActiveCampaignKpis() {
  const supabase = createAdminClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .in("status", ["planned", "active"])
    .limit(100);
  const results = [];
  for (const campaign of (campaigns ?? []) as Campaign[]) {
    try {
      await refreshCampaignKpis(campaign);
      results.push({ id: campaign.id, ok: true });
    } catch (error) {
      results.push({
        id: campaign.id,
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}
