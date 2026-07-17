"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  generateKeywordMap,
  generateSeoArticle,
  generateSeoBrief,
} from "@/lib/agents/seo/generate";
import { getBrandContext } from "@/lib/brand/context";
import { signOAuthState } from "@/lib/crypto";
import { inngest } from "@/lib/inngest/client";
import { requireActiveOrg } from "@/lib/org/require";
import { scoreArticleAgainstBrief } from "@/lib/seo/checklist";
import {
  getGscAuthorizationUrl,
} from "@/lib/seo/gsc";
import { createClient } from "@/lib/supabase/server";
import type { SeoKeywordMap } from "@/lib/types/seo";

export type SeoActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") throw new Error("Viewers cannot modify SEO");
  return ctx;
}

async function primaryBrandId(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data) return data.id;
  const { data: fallback } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (!fallback) throw new Error("No brand found");
  return fallback.id;
}

export async function createSeoProject(
  _prev: SeoActionResult,
  formData: FormData,
): Promise<SeoActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const domain = String(formData.get("domain") ?? "")
      .trim()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .toLowerCase();
    const name = String(formData.get("name") ?? "").trim() || domain;
    if (!domain.includes(".")) return { error: "Enter a valid domain" };
    const brandId = await primaryBrandId(active.organization_id);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("seo_projects")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        name,
        domain,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Failed" };
    revalidatePath("/seo");
    redirect(`/seo/projects/${data.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function startGscOAuth(formData: FormData) {
  const { active } = await assertCanWrite();
  const projectId = String(formData.get("projectId") ?? "");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectUri = `${site}/api/seo/gsc/callback`;
  const state = signOAuthState({
    organizationId: active.organization_id,
    projectId,
    ts: String(Date.now()),
  });
  redirect(getGscAuthorizationUrl({ state, redirectUri }));
}

export async function setGscSiteUrl(formData: FormData) {
  const { active } = await assertCanWrite();
  const projectId = String(formData.get("projectId") ?? "");
  const siteUrl = String(formData.get("siteUrl") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("seo_projects")
    .update({ gsc_site_url: siteUrl })
    .eq("id", projectId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);
  revalidatePath(`/seo/projects/${projectId}`);
}

export async function syncGscNow(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  await inngest.send({
    name: "seo/gsc.sync",
    data: { projectId },
  });
  revalidatePath(`/seo/projects/${projectId}`);
}

export async function runAuditNow(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  await assertCanWrite();
  await inngest.send({
    name: "seo/audit.run",
    data: { projectId },
  });
  revalidatePath(`/seo/projects/${projectId}/audit`);
}

export async function generateKeywordStrategy(
  _prev: SeoActionResult,
  formData: FormData,
): Promise<SeoActionResult> {
  try {
    const { active } = await assertCanWrite();
    const projectId = String(formData.get("projectId") ?? "");
    const supabase = await createClient();
    const { data: project } = await supabase
      .from("seo_projects")
      .select("*")
      .eq("id", projectId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!project) return { error: "Project not found" };

    const brandContext = await getBrandContext(
      active.organization_id,
      project.brand_id,
    );

    const { data: gsc } = await supabase
      .from("seo_gsc_daily")
      .select("query, clicks, impressions, position")
      .eq("project_id", projectId)
      .order("clicks", { ascending: false })
      .limit(40);

    const gscQueriesMarkdown = (gsc ?? [])
      .map(
        (r) =>
          `- ${r.query}: clicks ${r.clicks}, impr ${r.impressions}, pos ${r.position}`,
      )
      .join("\n");

    const { data: competitors } = await supabase
      .from("competitors")
      .select("name, website, positioning")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", project.brand_id)
      .limit(10);

    const { data: run } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: active.organization_id,
        module: "seo",
        agent_name: "seo_keyword_strategy",
        status: "running",
        input: { projectId },
        logs: [{ at: new Date().toISOString(), message: "Building keyword map" }],
        progress: 10,
      })
      .select("id")
      .single();

    const generated = await generateKeywordMap({
      brandContext,
      domain: project.domain,
      gscQueriesMarkdown,
      competitorNotes: (competitors ?? [])
        .map((c) => `- ${c.name} (${c.website ?? "n/a"}): ${c.positioning ?? ""}`)
        .join("\n"),
    });

    if (run) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          output: generated.data,
          model: generated.model,
          tokens_in: generated.tokensIn,
          tokens_out: generated.tokensOut,
          cost_pence: generated.costPence,
          progress: 100,
        })
        .eq("id", run.id);
    }

    const map = generated.data as SeoKeywordMap;
    await supabase
      .from("seo_projects")
      .update({ keyword_map: map })
      .eq("id", projectId);

    // Upsert keywords from map
    for (const pillar of map.pillars) {
      await supabase.from("seo_keywords").upsert(
        {
          organization_id: active.organization_id,
          project_id: projectId,
          keyword: pillar.primary_keyword,
          intent: "commercial",
          priority: "high",
          pillar: pillar.name,
          cluster: null,
          tracked: true,
        },
        { onConflict: "project_id,keyword" },
      );
      for (const cluster of pillar.clusters) {
        for (const keyword of cluster.keywords) {
          await supabase.from("seo_keywords").upsert(
            {
              organization_id: active.organization_id,
              project_id: projectId,
              keyword,
              intent: "informational",
              priority: "medium",
              pillar: pillar.name,
              cluster: cluster.name,
              tracked: true,
            },
            { onConflict: "project_id,keyword" },
          );
        }
      }
    }

    revalidatePath(`/seo/projects/${projectId}/keywords`);
    return { success: "Keyword map generated" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function saveKeywordMap(
  _prev: SeoActionResult,
  formData: FormData,
): Promise<SeoActionResult> {
  try {
    const { active } = await assertCanWrite();
    const projectId = String(formData.get("projectId") ?? "");
    const map = JSON.parse(String(formData.get("keywordMap") ?? "{}")) as SeoKeywordMap;
    const supabase = await createClient();
    const { error } = await supabase
      .from("seo_projects")
      .update({ keyword_map: map })
      .eq("id", projectId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath(`/seo/projects/${projectId}/keywords`);
    return { success: "Keyword map saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export async function createBriefForKeyword(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const keywordId = String(formData.get("keywordId") ?? "");
  const supabase = await createClient();
  const { data: keyword } = await supabase
    .from("seo_keywords")
    .select("*")
    .eq("id", keywordId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!keyword) throw new Error("Keyword not found");

  const { data: project } = await supabase
    .from("seo_projects")
    .select("*")
    .eq("id", keyword.project_id)
    .single();
  if (!project) throw new Error("Project not found");

  const brandContext = await getBrandContext(
    active.organization_id,
    project.brand_id,
  );

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: active.organization_id,
      module: "seo",
      agent_name: "seo_content_brief",
      status: "running",
      input: { keywordId },
      logs: [{ at: new Date().toISOString(), message: "Generating brief" }],
      progress: 10,
    })
    .select("id")
    .single();

  const generated = await generateSeoBrief({
    brandContext,
    keyword: keyword.keyword,
    intent: keyword.intent,
    domain: project.domain,
  });

  if (run) {
    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        output: generated.data,
        model: generated.model,
        tokens_in: generated.tokensIn,
        tokens_out: generated.tokensOut,
        cost_pence: generated.costPence,
        progress: 100,
      })
      .eq("id", run.id);
  }

  const { data: brief, error } = await supabase
    .from("seo_content_briefs")
    .insert({
      organization_id: active.organization_id,
      project_id: project.id,
      keyword_id: keywordId,
      title: generated.data.title,
      brief_markdown: generated.data.brief_markdown,
      outline: generated.data.outline,
      entities: generated.data.entities,
      internal_links: generated.data.internal_links,
      target_word_count: generated.data.target_word_count,
      search_intent: generated.data.search_intent,
      status: "ready",
      agent_run_id: run?.id ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !brief) throw new Error(error?.message ?? "Failed to save brief");

  revalidatePath(`/seo/projects/${project.id}/briefs`);
  redirect(`/seo/briefs/${brief.id}`);
}

export async function draftArticleFromBrief(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const briefId = String(formData.get("briefId") ?? "");
  const supabase = await createClient();
  const { data: brief } = await supabase
    .from("seo_content_briefs")
    .select("*")
    .eq("id", briefId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!brief) throw new Error("Brief not found");

  const { data: keyword } = await supabase
    .from("seo_keywords")
    .select("*")
    .eq("id", brief.keyword_id)
    .single();
  const { data: project } = await supabase
    .from("seo_projects")
    .select("*")
    .eq("id", brief.project_id)
    .single();
  if (!project || !keyword) throw new Error("Missing project/keyword");

  const brandContext = await getBrandContext(
    active.organization_id,
    project.brand_id,
  );

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: active.organization_id,
      module: "seo",
      agent_name: "seo_article_draft",
      status: "running",
      input: { briefId },
      logs: [{ at: new Date().toISOString(), message: "Drafting article" }],
      progress: 10,
    })
    .select("id")
    .single();

  const generated = await generateSeoArticle({
    brandContext,
    briefMarkdown: brief.brief_markdown,
    keyword: keyword.keyword,
    outline: brief.outline ?? [],
    entities: brief.entities ?? [],
    targetWordCount: brief.target_word_count,
  });

  if (run) {
    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        output: generated.data,
        model: generated.model,
        tokens_in: generated.tokensIn,
        tokens_out: generated.tokensOut,
        cost_pence: generated.costPence,
        progress: 100,
      })
      .eq("id", run.id);
  }

  const checklist = scoreArticleAgainstBrief({
    title: generated.data.title,
    contentMarkdown: generated.data.content_markdown,
    brief,
    keyword: keyword.keyword,
  });

  const { data: article, error } = await supabase
    .from("seo_articles")
    .insert({
      organization_id: active.organization_id,
      project_id: brief.project_id,
      brief_id: briefId,
      title: generated.data.title,
      content_markdown: generated.data.content_markdown,
      status: "review",
      checklist_score: checklist.score,
      checklist,
      agent_run_id: run?.id ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !article) throw new Error(error?.message ?? "Failed");

  const { runEntityComplianceCheck } = await import("@/lib/compliance/check");
  await runEntityComplianceCheck({
    organizationId: active.organization_id,
    brandId: project.brand_id,
    entityType: "seo_article",
    entityId: article.id,
    title: generated.data.title,
    body: generated.data.content_markdown,
  });

  await supabase
    .from("seo_content_briefs")
    .update({ status: "in_progress" })
    .eq("id", briefId);

  redirect(`/seo/articles/${article.id}`);
}

export async function saveArticleDraft(
  _prev: SeoActionResult,
  formData: FormData,
): Promise<SeoActionResult> {
  try {
    const { active } = await assertCanWrite();
    const articleId = String(formData.get("articleId") ?? "");
    const title = String(formData.get("title") ?? "").trim();
    const content = String(formData.get("content") ?? "");
    const supabase = await createClient();
    const { data: article } = await supabase
      .from("seo_articles")
      .select("*")
      .eq("id", articleId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!article) return { error: "Article not found" };

    const { data: brief } = await supabase
      .from("seo_content_briefs")
      .select("*")
      .eq("id", article.brief_id)
      .single();
    const { data: keyword } = brief
      ? await supabase
          .from("seo_keywords")
          .select("*")
          .eq("id", brief.keyword_id)
          .single()
      : { data: null };

    const checklist =
      brief && keyword
        ? scoreArticleAgainstBrief({
            title,
            contentMarkdown: content,
            brief,
            keyword: keyword.keyword,
          })
        : { score: article.checklist_score ?? 0, checks: [] };

    const { error } = await supabase
      .from("seo_articles")
      .update({
        title,
        content_markdown: content,
        checklist_score: checklist.score,
        checklist,
        status: "review",
      })
      .eq("id", articleId);
    if (error) return { error: error.message };
    revalidatePath(`/seo/articles/${articleId}`);
    return { success: `Saved · checklist ${checklist.score}/100` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function approveArticle(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const articleId = String(formData.get("articleId") ?? "");
  const publishedUrl = String(formData.get("publishedUrl") ?? "").trim() || null;
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();

  const { assertComplianceAllowsApproval } = await import(
    "@/lib/compliance/gate"
  );
  const { writeAuditEvent } = await import("@/lib/compliance/audit");
  await assertComplianceAllowsApproval({
    organizationId: active.organization_id,
    entityType: "seo_article",
    entityId: articleId,
    userId: user.id,
    role: active.role,
    overrideReason: overrideReason || null,
    actionLabel: "Approve SEO article",
  });

  const supabase = await createClient();
  const nextStatus = publishedUrl ? "published" : "approved";
  const { error } = await supabase
    .from("seo_articles")
    .update({
      status: nextStatus,
      published_url: publishedUrl,
      published_at: publishedUrl ? new Date().toISOString() : null,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", articleId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: publishedUrl ? "publish" : "approval",
    entityType: "seo_article",
    entityId: articleId,
    summary: `SEO article ${nextStatus}`,
    after: { status: nextStatus, published_url: publishedUrl },
  });

  const { data: article } = await supabase
    .from("seo_articles")
    .select("brief_id")
    .eq("id", articleId)
    .single();
  if (article) {
    await supabase
      .from("seo_content_briefs")
      .update({ status: "completed" })
      .eq("id", article.brief_id);
  }
  revalidatePath(`/seo/articles/${articleId}`);
}
