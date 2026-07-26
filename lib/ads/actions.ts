"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  generateAdCreatives,
  generateMediaPlan,
} from "@/lib/agents/ads/generate";
import {
  upsertAdConnection,
} from "@/lib/ads/connections";
import { parseAdsSettings } from "@/lib/ads/settings";
import { applyRecommendation } from "@/lib/ads/recommendations";
import { getBrandContext } from "@/lib/brand/context";
import { assertPlanAllows } from "@/lib/billing/plans";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AdPlatform,
  MediaPlanPayload,
} from "@/lib/types/ads";
import { AD_PLATFORMS } from "@/lib/ads/providers";

export type AdsActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") throw new Error("Viewers cannot modify ads");
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
  if (!fallback) throw new Error("No brand found — create a brand first");
  return fallback.id;
}

export async function connectAdAccountManual(
  _prev: AdsActionResult,
  formData: FormData,
): Promise<AdsActionResult> {
  try {
    const { active } = await assertCanWrite();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners/admins can connect ad accounts" };
    }
    const platform = String(formData.get("platform") ?? "") as AdPlatform;
    if (!AD_PLATFORMS.includes(platform)) return { error: "Invalid platform" };
    const accountId = String(formData.get("accountId") ?? "").trim();
    const accountName = String(formData.get("accountName") ?? "").trim();
    const accessToken = String(formData.get("accessToken") ?? "").trim();
    if (!accountId || !accountName || !accessToken) {
      return { error: "Account id, name, and access token are required" };
    }
    const brandId = await primaryBrandId(active.organization_id);
    const loginCustomerId =
      process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "").trim() ||
      undefined;
    await upsertAdConnection({
      organizationId: active.organization_id,
      brandId,
      platform,
      tokens: {
        accessToken,
        accountId,
        accountName,
        refreshToken: String(formData.get("refreshToken") ?? "") || null,
        metadata:
          platform === "google" && loginCustomerId
            ? { login_customer_id: loginCustomerId, google_ads_api: true }
            : platform === "google"
              ? { google_ads_api: true }
              : undefined,
      },
    });
    revalidatePath("/ads/connections");
    return { success: "Ad account connected" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function disconnectAdAccount(formData: FormData) {
  const { active } = await assertCanWrite();
  if (active.role !== "org_owner" && active.role !== "org_admin") {
    throw new Error("Only owners/admins can disconnect");
  }
  const id = String(formData.get("connectionId") ?? "");
  const supabase = await createClient();
  await supabase
    .from("ad_connections")
    .delete()
    .eq("id", id)
    .eq("organization_id", active.organization_id);
  revalidatePath("/ads/connections");
}

export async function startAdOAuth(formData: FormData) {
  // Kept for compatibility; UI now uses GET /api/ads/oauth/[platform]/start
  // because redirect() to an external URL from a fetch-based server action
  // returns HTML and breaks the client with "Unexpected token '<' ... is not valid JSON".
  const platform = String(formData.get("platform") ?? "") as AdPlatform;
  if (!AD_PLATFORMS.includes(platform)) {
    throw new Error("Invalid platform");
  }
  redirect(`/api/ads/oauth/${platform}/start`);
}

export async function saveAdsOrgSettings(
  _prev: AdsActionResult,
  formData: FormData,
): Promise<AdsActionResult> {
  try {
    const { active } = await assertCanWrite();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners/admins can change auto-optimise settings" };
    }
    const supabase = await createClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", active.organization_id)
      .single();
    const settings = (org?.settings ?? {}) as Record<string, unknown>;
    const next = {
      ...settings,
      ads: {
        auto_optimise: formData.get("autoOptimise") === "on",
        max_daily_budget_change_pence: Math.max(
          0,
          Math.round(Number(formData.get("maxDailyChange") ?? 50) * 100),
        ),
        currency: String(formData.get("currency") ?? "GBP"),
      },
    };
    const { error } = await supabase
      .from("organizations")
      .update({ settings: next })
      .eq("id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/ads/settings");
    return { success: "Ads settings saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function createMediaPlanWithAi(
  _prev: AdsActionResult,
  formData: FormData,
): Promise<AdsActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");
    const brief = String(formData.get("goalBrief") ?? "").trim();
    if (brief.length < 10) return { error: "Describe the goal in more detail" };
    const monthlyBudget = Math.round(
      Number(formData.get("monthlyBudget") ?? 0) * 100,
    );
    if (monthlyBudget < 100) return { error: "Monthly budget required" };
    const targetRoas = formData.get("targetRoas")
      ? Number(formData.get("targetRoas"))
      : null;
    const brandId = await primaryBrandId(active.organization_id);
    const brandContext = await getBrandContext(active.organization_id, brandId);

    const supabase = await createClient();
    const { data: research } = await supabase
      .from("research_documents")
      .select("section, content")
      .eq("organization_id", active.organization_id)
      .order("created_at", { ascending: false })
      .limit(5);
    const researchMarkdown = (research ?? [])
      .map((d) => `### ${d.section}\n${String(d.content ?? "").slice(0, 2000)}`)
      .join("\n\n");

    const { data: run } = await supabase
      .from("agent_runs")
      .insert({
        organization_id: active.organization_id,
        module: "ads",
        agent_name: "ads_strategist",
        status: "running",
        input: { brief, monthlyBudget, targetRoas },
        logs: [{ at: new Date().toISOString(), message: "Generating media plan" }],
        progress: 10,
      })
      .select("id")
      .single();

    const generated = await generateMediaPlan({
      brandContext,
      goalBrief: brief,
      monthlyBudgetPence: monthlyBudget,
      currency: String(formData.get("currency") ?? "GBP"),
      targetRoas,
      objective: String(formData.get("objective") ?? "purchases"),
      researchMarkdown,
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

    const planPayload: MediaPlanPayload = {
      summary: generated.data.summary,
      platform_split: generated.data.platform_split,
      funnel_stages: generated.data.funnel_stages,
      campaigns: generated.data.campaigns,
      creative_brief: generated.data.creative_brief,
      risks: generated.data.risks,
    };

    const { data: plan, error } = await supabase
      .from("ad_media_plans")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        name: generated.data.name,
        goal_brief: brief,
        monthly_budget_pence: monthlyBudget,
        currency: String(formData.get("currency") ?? "GBP"),
        target_roas: targetRoas,
        objective: String(formData.get("objective") ?? "purchases"),
        plan: planPayload,
        status: "pending_approval",
        agent_run_id: run?.id ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !plan) return { error: error?.message ?? "Failed to save plan" };
    redirect(`/ads/plans/${plan.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function approveMediaPlan(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const planId = String(formData.get("planId") ?? "");
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("ad_media_plans")
    .select("*")
    .eq("id", planId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!plan) throw new Error("Plan not found");

  const payload = plan.plan as MediaPlanPayload;
  const { data: connections } = await supabase
    .from("ad_connections")
    .select("id, platform")
    .eq("organization_id", active.organization_id)
    .eq("status", "active");

  const connectionByPlatform = new Map(
    (connections ?? []).map((c) => [c.platform, c.id]),
  );

  for (const spec of payload.campaigns ?? []) {
    await supabase.from("ad_campaigns").insert({
      organization_id: active.organization_id,
      brand_id: plan.brand_id,
      connection_id: connectionByPlatform.get(spec.platform) ?? null,
      media_plan_id: planId,
      platform: spec.platform,
      name: spec.name,
      objective: spec.objective,
      status: "approved",
      daily_budget_pence: spec.daily_budget_pence,
      currency: plan.currency,
      targeting: {
        audience: spec.audience,
        notes: spec.targeting_notes,
      },
      funnel_stage: spec.funnel_stage,
      target_roas: plan.target_roas,
      is_managed: true,
      created_by: user.id,
    });
  }

  await supabase
    .from("ad_media_plans")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", planId);

  const { writeAuditEvent } = await import("@/lib/compliance/audit");
  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "approval",
    entityType: "ad_media_plan",
    entityId: planId,
    summary: "Media plan approved",
    after: { status: "approved" },
  });

  revalidatePath(`/ads/plans/${planId}`);
  revalidatePath("/ads/campaigns");
}

export async function updateMediaPlanJson(
  _prev: AdsActionResult,
  formData: FormData,
): Promise<AdsActionResult> {
  try {
    const { active } = await assertCanWrite();
    const planId = String(formData.get("planId") ?? "");
    const plan = JSON.parse(String(formData.get("planJson") ?? "{}")) as MediaPlanPayload;
    const supabase = await createClient();
    const { error } = await supabase
      .from("ad_media_plans")
      .update({ plan, name: String(formData.get("name") ?? "").trim() || undefined })
      .eq("id", planId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath(`/ads/plans/${planId}`);
    return { success: "Plan updated" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export async function generateCreativesForCampaign(formData: FormData) {
  const { user, active } = await assertCanWrite();
  await assertPlanAllows(active.organization_id, "ai_runs_month");
  const campaignId = String(formData.get("campaignId") ?? "");
  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  const brandContext = await getBrandContext(
    active.organization_id,
    campaign.brand_id,
  );
  let creativeBrief = String(formData.get("brief") ?? "").trim();
  if (!creativeBrief && campaign.media_plan_id) {
    const { data: plan } = await supabase
      .from("ad_media_plans")
      .select("plan")
      .eq("id", campaign.media_plan_id)
      .maybeSingle();
    creativeBrief =
      (plan?.plan as MediaPlanPayload | undefined)?.creative_brief ??
      campaign.objective ??
      campaign.name;
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: active.organization_id,
      module: "ads",
      agent_name: "ads_creative",
      status: "running",
      input: { campaignId },
      logs: [{ at: new Date().toISOString(), message: "Generating creatives" }],
      progress: 10,
    })
    .select("id")
    .single();

  const generated = await generateAdCreatives({
    brandContext,
    platform: campaign.platform,
    campaignName: campaign.name,
    objective: campaign.objective,
    creativeBrief: creativeBrief || campaign.name,
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

  for (const variant of generated.data.variants) {
    const { data: creative } = await supabase
      .from("ad_creatives")
      .insert({
        organization_id: active.organization_id,
        brand_id: campaign.brand_id,
        campaign_id: campaignId,
        format: variant.format,
        headline: variant.headline,
        primary_text: variant.primary_text,
        description: variant.description || null,
        cta: variant.cta,
        hook: variant.hook || null,
        status: "pending_approval",
        variant_label: variant.variant_label,
        agent_run_id: run?.id ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (creative) {
      const { runEntityComplianceCheck } = await import(
        "@/lib/compliance/check"
      );
      await runEntityComplianceCheck({
        organizationId: active.organization_id,
        brandId: campaign.brand_id,
        entityType: "ad",
        entityId: creative.id,
        title: variant.headline,
        body: [
          variant.primary_text,
          variant.description,
          variant.hook,
          variant.cta,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }
  }

  revalidatePath(`/ads/campaigns/${campaignId}`);
  revalidatePath("/ads/approvals");
}

export async function reviewCreative(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const creativeId = String(formData.get("creativeId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();
  const supabase = await createClient();
  if (decision === "approve") {
    const { assertComplianceAllowsApproval } = await import(
      "@/lib/compliance/gate"
    );
    const { writeAuditEvent } = await import("@/lib/compliance/audit");
    await assertComplianceAllowsApproval({
      organizationId: active.organization_id,
      entityType: "ad",
      entityId: creativeId,
      userId: user.id,
      role: active.role,
      overrideReason: overrideReason || null,
      actionLabel: "Approve ad creative",
    });
    await supabase
      .from("ad_creatives")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq("id", creativeId)
      .eq("organization_id", active.organization_id);
    await writeAuditEvent({
      organizationId: active.organization_id,
      actorUserId: user.id,
      action: "approval",
      entityType: "ad",
      entityId: creativeId,
      summary: "Ad creative approved",
      after: { status: "approved" },
    });
  } else {
    await supabase
      .from("ad_creatives")
      .update({
        status: "rejected",
        rejection_reason: String(formData.get("reason") ?? "Rejected") || "Rejected",
      })
      .eq("id", creativeId)
      .eq("organization_id", active.organization_id);
  }
  revalidatePath("/ads/approvals");
}

export async function applyAdRecommendation(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const id = String(formData.get("recommendationId") ?? "");
  await applyRecommendation({
    recommendationId: id,
    organizationId: active.organization_id,
    userId: user.id,
  });
  revalidatePath("/ads/recommendations");
}

export async function dismissAdRecommendation(formData: FormData) {
  const { active } = await assertCanWrite();
  const id = String(formData.get("recommendationId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("Dismiss reason is required");
  const supabase = await createClient();
  await supabase
    .from("ad_recommendations")
    .update({
      status: "dismissed",
      dismiss_reason: reason,
      dismissed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", active.organization_id);
  revalidatePath("/ads/recommendations");
}

export async function getAdsSettingsForOrg(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", organizationId)
    .single();
  return parseAdsSettings(data?.settings as Record<string, unknown>);
}

export async function linkCampaignToPlatform(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const campaignId = String(formData.get("campaignId") ?? "");
  const platformCampaignId = String(formData.get("platformCampaignId") ?? "").trim();
  const connectionId = String(formData.get("connectionId") ?? "") || null;
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("ad_campaigns")
    .select("platform_campaign_id, connection_id, status")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  const { error } = await supabase
    .from("ad_campaigns")
    .update({
      platform_campaign_id: platformCampaignId || null,
      connection_id: connectionId,
      // Linking never activates. A separate explicit Set live approval is required.
      status: platformCampaignId ? "pending_approval" : undefined,
    })
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);
  const { writeAuditEvent } = await import("@/lib/compliance/audit");
  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "ad_campaign_link",
    entityType: "ad_campaign",
    entityId: campaignId,
    summary: "Linked local campaign to platform campaign; launch approval required",
    before: before ?? null,
    after: {
      platform_campaign_id: platformCampaignId || null,
      connection_id: connectionId,
      status: platformCampaignId ? "pending_approval" : before?.status,
    },
  });
  revalidatePath(`/ads/campaigns/${campaignId}`);
}

export async function seedDemoMetrics(formData: FormData) {
  const { active } = await assertCanWrite();
  const campaignId = String(formData.get("campaignId") ?? "");
  const supabase = createAdminClient();
  const { data: campaign } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const spend = 2000 + Math.round(Math.random() * 4000);
    const impressions = 8000 + Math.round(Math.random() * 12000);
    const clicks = 80 + Math.round(Math.random() * 200);
    const conversions = 2 + Math.random() * 8;
    const revenue = Math.round(spend * (2 + Math.random() * 2));
    const cpm = impressions > 0 ? (spend / 100 / impressions) * 1000 : 0;
    const cpc = clicks > 0 ? Math.round(spend / clicks) : 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    const roas = spend > 0 ? revenue / spend : 0;
    await supabase.from("ad_metrics_daily").upsert(
      {
        organization_id: active.organization_id,
        campaign_id: campaignId,
        metric_date: d.toISOString().slice(0, 10),
        spend_pence: spend,
        impressions,
        clicks,
        conversions,
        revenue_pence: revenue,
        cpm,
        cpc_pence: cpc,
        ctr,
        roas,
        currency: campaign.currency,
        raw: { demo: true },
      },
      { onConflict: "campaign_id,metric_date" },
    );
  }
  revalidatePath("/ads");
  revalidatePath(`/ads/campaigns/${campaignId}`);
}
