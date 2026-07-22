"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { inngest } from "@/lib/inngest/client";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { ResearchProjectType } from "@/lib/types/research";
import {
  pushInsightsSchema,
  refreshResearchSchema,
  startResearchSchema,
} from "@/lib/validations/research";

export type ResearchActionResult = {
  error?: string;
  success?: string;
};

async function getPrimaryBrand(organizationId: string, brandId?: string) {
  const supabase = await createClient();

  if (brandId) {
    const { data, error } = await supabase
      .from("brands")
      .select("*")
      .eq("id", brandId)
      .eq("organization_id", organizationId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data) return data;

  const { data: fallback, error: fallbackError } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (fallbackError) throw new Error(fallbackError.message);
  if (!fallback) throw new Error("No brand found for this organization");
  return fallback;
}

async function enqueueResearchRun(params: {
  organizationId: string;
  brandId: string;
  type: ResearchProjectType;
  title: string;
  brief: Record<string, unknown>;
  createdBy: string;
  refreshedFromId?: string;
}) {
  const { assertPlanAllows } = await import("@/lib/billing/plans");
  await assertPlanAllows(params.organizationId, "ai_runs_month");

  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("research_projects")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      type: params.type,
      status: "queued",
      title: params.title,
      brief: params.brief,
      created_by: params.createdBy,
      refreshed_from_id: params.refreshedFromId ?? null,
    })
    .select("*")
    .single();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "Failed to create research project");
  }

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "research",
      agent_name: params.type,
      status: "queued",
      input: params.brief,
      logs: [{ at: new Date().toISOString(), message: "Queued research run" }],
      progress: 0,
      research_project_id: project.id,
    })
    .select("*")
    .single();

  if (runError || !run) {
    throw new Error(runError?.message ?? "Failed to create agent run");
  }

  await supabase
    .from("research_projects")
    .update({ latest_agent_run_id: run.id })
    .eq("id", project.id);

  await inngest.send({
    name: "research/run.requested",
    data: { projectId: project.id, agentRunId: run.id },
  });

  return project;
}

export async function startResearch(
  _prev: ResearchActionResult,
  formData: FormData,
): Promise<ResearchActionResult> {
  const parsed = startResearchSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    notes: formData.get("notes"),
    brandId: formData.get("brandId") || undefined,
    competitorUrls: formData.get("competitorUrls") || undefined,
    discoverTop5: formData.get("discoverTop5") || undefined,
    model: formData.get("model") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { user, active } = await requireActiveOrg();
    if (active.role === "org_viewer") {
      return { error: "Viewers cannot start research" };
    }

    const brand = await getPrimaryBrand(
      active.organization_id,
      parsed.data.brandId,
    );

    const project = await enqueueResearchRun({
      organizationId: active.organization_id,
      brandId: brand.id,
      type: parsed.data.type,
      title: parsed.data.title,
      createdBy: user.id,
      brief: {
        notes: parsed.data.notes,
        competitorUrls: parsed.data.competitorUrls,
        discoverTop5: parsed.data.discoverTop5 ?? true,
        model: parsed.data.model || undefined,
        promptVersion: "research-v1",
      },
    });

    redirect(`/research/${project.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return {
      error: error instanceof Error ? error.message : "Failed to start research",
    };
  }
}

export async function refreshResearch(
  _prev: ResearchActionResult,
  formData: FormData,
): Promise<ResearchActionResult> {
  const parsed = refreshResearchSchema.safeParse({
    projectId: formData.get("projectId"),
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { user, active } = await requireActiveOrg();
    if (active.role === "org_viewer") {
      return { error: "Viewers cannot refresh research" };
    }

    const supabase = await createClient();
    const { data: source, error } = await supabase
      .from("research_projects")
      .select("*")
      .eq("id", parsed.data.projectId)
      .eq("organization_id", active.organization_id)
      .single();

    if (error || !source) {
      return { error: "Research project not found" };
    }

    const priorBrief = (source.brief ?? {}) as Record<string, unknown>;
    const project = await enqueueResearchRun({
      organizationId: active.organization_id,
      brandId: source.brand_id,
      type: source.type,
      title: `${source.title} (refresh)`,
      createdBy: user.id,
      refreshedFromId: source.id,
      brief: {
        ...priorBrief,
        notes:
          parsed.data.notes ||
          String(priorBrief.notes ?? `Refresh of ${source.title}`),
        refreshedFromId: source.id,
      },
    });

    redirect(`/research/${project.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    return {
      error: error instanceof Error ? error.message : "Failed to refresh research",
    };
  }
}

export async function pushInsightsToBrand(
  _prev: ResearchActionResult,
  formData: FormData,
): Promise<ResearchActionResult> {
  const parsed = pushInsightsSchema.safeParse({
    projectId: formData.get("projectId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { active } = await requireActiveOrg();
  if (active.role === "org_viewer") {
    return { error: "Viewers cannot update the brand profile" };
  }

  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("research_projects")
    .select("*")
    .eq("id", parsed.data.projectId)
    .eq("organization_id", active.organization_id)
    .single();

  if (error || !project) {
    return { error: "Research project not found" };
  }

  if (project.status !== "complete" || !project.latest_agent_run_id) {
    return { error: "Research must be complete before pushing insights" };
  }

  const { data: run, error: runError } = await supabase
    .from("agent_runs")
    .select("output")
    .eq("id", project.latest_agent_run_id)
    .single();

  if (runError || !run?.output) {
    return { error: "Missing research output" };
  }

  const output = run.output as {
    structured?: Record<string, unknown>;
    recommended_actions?: string[];
  };
  const structured = output.structured ?? {};

  if (project.type === "competitor") {
    const competitors = Array.isArray(structured.competitors)
      ? structured.competitors
      : [];

    for (const raw of competitors) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as Record<string, unknown>;
      const name = String(item.name ?? "").trim();
      if (!name) continue;

      const payload = {
        organization_id: active.organization_id,
        brand_id: project.brand_id,
        name,
        website: item.website ? String(item.website) : null,
        social_handles:
          (item.social_handles as Record<string, unknown> | undefined) ?? {},
        positioning: item.positioning ? String(item.positioning) : null,
        strengths: Array.isArray(item.strengths)
          ? item.strengths.map(String)
          : [],
        weaknesses: Array.isArray(item.weaknesses)
          ? item.weaknesses.map(String)
          : [],
        pricing_notes: item.pricing_notes ? String(item.pricing_notes) : null,
        content_strategy: item.content_strategy
          ? String(item.content_strategy)
          : null,
        ad_presence: item.ad_presence ? String(item.ad_presence) : null,
        seo_strengths: item.seo_strengths ? String(item.seo_strengths) : null,
        social_performance: item.social_performance
          ? String(item.social_performance)
          : null,
        comparison: (item.comparison as Record<string, unknown> | undefined) ?? {},
        source_research_project_id: project.id,
        last_analyzed_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("competitors")
        .select("id")
        .eq("organization_id", active.organization_id)
        .eq("brand_id", project.brand_id)
        .ilike("name", name)
        .maybeSingle();

      if (existing) {
        await supabase.from("competitors").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("competitors").insert(payload);
      }
    }
  } else if (project.type === "audience") {
    const personas = Array.isArray(structured.personas) ? structured.personas : [];
    for (const raw of personas) {
      if (!raw || typeof raw !== "object") continue;
      const persona = raw as Record<string, unknown>;
      const name = String(persona.name ?? "").trim();
      if (!name) continue;

      const payload = {
        organization_id: active.organization_id,
        brand_id: project.brand_id,
        name,
        description: persona.description ? String(persona.description) : null,
        demographics:
          (persona.demographics as Record<string, unknown> | undefined) ?? {},
        psychographics:
          (persona.psychographics as Record<string, unknown> | undefined) ?? {},
        channel_behaviour:
          (persona.channel_behaviour as Record<string, unknown> | undefined) ??
          {},
        messaging_angles: Array.isArray(persona.messaging_angles)
          ? persona.messaging_angles.map(String)
          : [],
        source_research_project_id: project.id,
      };

      const { data: existing } = await supabase
        .from("brand_audiences")
        .select("id")
        .eq("organization_id", active.organization_id)
        .eq("brand_id", project.brand_id)
        .ilike("name", name)
        .maybeSingle();

      if (existing) {
        await supabase.from("brand_audiences").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("brand_audiences").insert(payload);
      }
    }
  } else if (project.type === "brand_audit") {
    const { data: brand } = await supabase
      .from("brands")
      .select("guidelines")
      .eq("id", project.brand_id)
      .single();

    const updates: {
      positioning?: string;
      guidelines: Record<string, unknown>;
    } = {
      guidelines: {
        ...(brand?.guidelines ?? {}),
        last_brand_audit_project_id: project.id,
        messaging_clarity: structured.messaging_clarity ?? null,
        visual_consistency: structured.visual_consistency ?? null,
        content_gaps: structured.content_gaps ?? [],
        quick_wins: structured.quick_wins ?? [],
        recommended_actions: output.recommended_actions ?? [],
      },
    };

    if (structured.positioning) {
      updates.positioning = String(structured.positioning);
    }

    await supabase
      .from("brands")
      .update(updates)
      .eq("id", project.brand_id)
      .eq("organization_id", active.organization_id);
  } else {
    const { data: brand } = await supabase
      .from("brands")
      .select("guidelines")
      .eq("id", project.brand_id)
      .single();

    await supabase
      .from("brands")
      .update({
        guidelines: {
          ...(brand?.guidelines ?? {}),
          [`last_${project.type}_project_id`]: project.id,
          recommended_actions: output.recommended_actions ?? [],
          structured,
        },
      })
      .eq("id", project.brand_id)
      .eq("organization_id", active.organization_id);
  }

  revalidatePath(`/research/${project.id}`);
  revalidatePath("/brand");
  return { success: "Insights pushed to Brand profile" };
}
