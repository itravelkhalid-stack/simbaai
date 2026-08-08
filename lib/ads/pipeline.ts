import "server-only";

import { generateMediaPlan, generateAdCreatives } from "@/lib/agents/ads/generate";
import { getBrandContext } from "@/lib/brand/context";
import { listActiveDirectives } from "@/lib/ads/directives";
import {
  ensureLaunchReview,
  runDeterministicLaunchChecks,
} from "@/lib/ads/launch-review";
import { getAdmissibleDestinations } from "@/lib/ads/seasonality";
import { adsTable } from "@/lib/ads/db";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdPlatform } from "@/lib/types/ads";

const META_PIXEL_BLOCKER = {
  code: "meta_pixel_missing",
  title: "Meta Pixel not installed",
  body: "Conversion optimisation (purchase/lead events) is blocked until the Meta Pixel is installed and verified. First-flight campaigns must use traffic / link-click objectives only.",
  severity: "critical" as const,
  blocks_conversion_optimisation: true,
};

export async function ensureMetaPixelSetupBlocker(params: {
  organizationId: string;
  brandId: string;
}) {
  const supabase = createAdminClient();
  await adsTable(supabase, "ads_setup_blockers").upsert(
    {
      organization_id: params.organizationId,
      brand_id: params.brandId,
      ...META_PIXEL_BLOCKER,
      resolved_at: null,
    },
    { onConflict: "organization_id,brand_id,code" },
  );
}

/**
 * Build a media plan driven by active directives or seasonality + evidence.
 * Creates local Meta campaign shell(s) from the plan, generates creatives,
 * and opens a launch review board (does NOT call Meta Graph).
 */
export async function runAdsPlanningPipeline(params: {
  organizationId: string;
  brandId: string;
  monthlyBudgetPence: number;
  currency?: string;
  /** Force a specific directive id */
  directiveId?: string;
  createdBy?: string | null;
}): Promise<{
  mediaPlanId: string;
  campaignIds: string[];
  directiveId: string | null;
  evidence: string[];
  builtNotProven: true;
}> {
  const supabase = createAdminClient();
  await ensureMetaPixelSetupBlocker(params);

  const brandContext = await getBrandContext(
    params.organizationId,
    params.brandId,
    { admin: true },
  );

  const directives = await listActiveDirectives({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });
  const directive = params.directiveId
    ? directives.find((d) => d.id === params.directiveId) ?? null
    : directives[0] ?? null;

  const admissible = await getAdmissibleDestinations({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });

  const evidence: string[] = [];
  let goalBrief: string;

  if (directive) {
    goalBrief = [
      `BINDING DIRECTIVE (${directive.scope}): ${directive.title}`,
      `Focus: ${directive.focus_text}`,
      directive.budget_share_pct
        ? `Budget share hint: ${directive.budget_share_pct}% of monthly`
        : null,
      directive.notes ? `Notes: ${directive.notes}` : null,
      "Build ONE Meta campaign around this directive. Optimisation: link clicks / landing page views (no conversion events — Meta Pixel not installed).",
    ]
      .filter(Boolean)
      .join("\n");
    evidence.push(`directive:${directive.id}:${directive.focus_text}`);
  } else {
    const picks = admissible.slice(0, 5);
    evidence.push(
      ...picks.map(
        (p) =>
          `seasonality:${p.destination_slug}:month=${p.stay_month}:${p.decision.reason}`,
      ),
    );
    goalBrief = [
      "No active human directive — select from seasonality booking windows + brand context.",
      picks.length
        ? `Admissible stay opportunities now:\n${picks
            .map(
              (p) =>
                `- ${p.destination_name} stay-month ${p.stay_month} (${p.visit_attractiveness}): ${p.decision.reason}`,
            )
            .join("\n")}`
        : "No admissible seasonality rows — use open brand demand research cautiously.",
      "Create Meta campaign(s) optimised for link clicks / landing page views only (Meta Pixel absent).",
    ].join("\n\n");
  }

  const researchMarkdown = [
    "## Selection evidence",
    ...evidence.map((e) => `- ${e}`),
    "",
    "## Standing setup blockers",
    `- ${META_PIXEL_BLOCKER.code}: ${META_PIXEL_BLOCKER.body}`,
  ].join("\n");

  const { data: agentRun } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "ads",
      agent_name: "ads_pipeline_strategist",
      status: "running",
      progress: 15,
      input: {
        brandId: params.brandId,
        directiveId: directive?.id ?? null,
        evidence,
      },
    })
    .select("id")
    .single();

  const generated = await generateMediaPlan({
    brandContext,
    goalBrief,
    monthlyBudgetPence: params.monthlyBudgetPence,
    currency: params.currency ?? "GBP",
    objective: "traffic_link_clicks",
    researchMarkdown,
  });

  // Prefer Meta-only for first flight pipeline
  const plan = {
    ...generated.data,
    campaigns: generated.data.campaigns
      .map((c) => ({ ...c, platform: "meta" as AdPlatform }))
      .slice(0, directive ? 1 : 3),
  };

  const { data: mediaPlan, error: planErr } = await supabase
    .from("ad_media_plans")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      name: plan.name,
      goal_brief: goalBrief,
      monthly_budget_pence: params.monthlyBudgetPence,
      currency: params.currency ?? "GBP",
      objective: "traffic_link_clicks",
      plan,
      status: "approved",
      agent_run_id: agentRun?.id ?? null,
      created_by: params.createdBy ?? null,
      approved_at: new Date().toISOString(),
      directive_id: directive?.id ?? null,
      selection_evidence: evidence,
    })
    .select("id")
    .single();
  if (planErr || !mediaPlan) throw new Error(planErr?.message ?? "plan insert failed");

  const website = brandContext.brand.website ?? "";
  const campaignIds: string[] = [];

  for (const spec of plan.campaigns) {
    const daily = Math.min(
      spec.daily_budget_pence,
      // Prefer £2 first-flight friendly unless plan is lower
      spec.daily_budget_pence,
    );

    const { data: brief } = await adsTable(supabase, "ad_targeting_briefs")
      .insert({
        organization_id: params.organizationId,
        brand_id: params.brandId,
        directive_id: directive?.id ?? null,
        media_plan_id: mediaPlan.id,
        summary: spec.audience,
        demographics: {},
        interests: [],
        geos: ["GB"],
        rationale: spec.targeting_notes,
        evidence: evidence.map((e) => ({ type: "pipeline", value: e })),
        seasonality_refs: admissible.slice(0, 5).map((a) => ({
          destination_slug: a.destination_slug,
          stay_month: a.stay_month,
          reason: a.decision.reason,
        })),
        agent_run_id: agentRun?.id ?? null,
      })
      .select("id")
      .single();

    const finalUrl = website
      ? `${website.replace(/\/$/, "")}/?utm_source=meta&utm_medium=paid&utm_campaign=${encodeURIComponent(spec.name.slice(0, 40))}`
      : "";

    const { data: campaign, error: cErr } = await supabase
      .from("ad_campaigns")
      .insert({
        organization_id: params.organizationId,
        brand_id: params.brandId,
        media_plan_id: mediaPlan.id,
        platform: "meta",
        name: spec.name,
        objective: "OUTCOME_TRAFFIC",
        status: "draft",
        daily_budget_pence: daily,
        currency: params.currency ?? "GBP",
        targeting: {
          audience: spec.audience,
          notes: spec.targeting_notes,
          final_url: finalUrl,
          countries: ["GB"],
          evidence,
        },
        funnel_stage: spec.funnel_stage,
        directive_id: directive?.id ?? null,
        targeting_brief_id: brief?.id ?? null,
        optimization_goal: "link_clicks_landing_views",
        setup_blockers: [META_PIXEL_BLOCKER],
        created_by: params.createdBy ?? null,
      })
      .select("id")
      .single();
    if (cErr || !campaign) throw new Error(cErr?.message ?? "campaign insert failed");

    if (brief?.id) {
      await adsTable(supabase, "ad_targeting_briefs")
        .update({ campaign_id: campaign.id })
        .eq("id", brief.id);
    }

    // Creatives
    const creatives = await generateAdCreatives({
      brandContext,
      platform: "meta",
      campaignName: spec.name,
      objective: "traffic",
      creativeBrief: `${plan.creative_brief}\nAudience: ${spec.audience}`,
    });

    for (const variant of creatives.data.variants.slice(0, 3)) {
      let mediaUrls: string[] = [];
      try {
        const { selectBestLibraryImage } = await import("@/lib/media/select");
        const { createAdminClient: admin } = await import(
          "@/lib/supabase/admin"
        );
        const assetId = await selectBestLibraryImage({
          organizationId: params.organizationId,
          brandId: params.brandId,
          topic: `${spec.name} ${variant.headline}`,
          title: variant.headline,
          copy: variant.primary_text,
          platform: "facebook",
          format: "post",
        });
        if (assetId) {
          const sb = admin();
          const { data: asset } = await sb
            .from("media_assets")
            .select("public_url")
            .eq("id", assetId)
            .maybeSingle();
          if (asset?.public_url) mediaUrls = [asset.public_url];
        }
      } catch {
        // brand review catches missing images
      }

      const { data: creative } = await supabase
        .from("ad_creatives")
        .insert({
          organization_id: params.organizationId,
          brand_id: params.brandId,
          campaign_id: campaign.id,
          format: variant.format || "single_image",
          headline: variant.headline,
          primary_text: variant.primary_text,
          description: variant.description,
          cta: variant.cta || "LEARN_MORE",
          hook: variant.hook,
          media_urls: mediaUrls,
          status: "pending_approval",
          variant_label: variant.variant_label,
          agent_run_id: agentRun?.id ?? null,
        })
        .select("id")
        .single();

      if (creative) {
        try {
          const { runEntityComplianceCheck } = await import(
            "@/lib/compliance/check"
          );
          await runEntityComplianceCheck({
            organizationId: params.organizationId,
            brandId: params.brandId,
            entityType: "ad",
            entityId: creative.id,
            title: variant.headline,
            body: `${variant.primary_text}\n${variant.description ?? ""}`,
            extra: { platform: "meta", cta: variant.cta },
          });
        } catch {
          // non-blocking
        }
      }
    }

    const reviewId = await ensureLaunchReview({
      organizationId: params.organizationId,
      brandId: params.brandId,
      campaignId: campaign.id,
    });
    await runDeterministicLaunchChecks({
      organizationId: params.organizationId,
      brandId: params.brandId,
      campaignId: campaign.id,
      reviewId,
    });

    campaignIds.push(campaign.id);
  }

  if (agentRun) {
    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        progress: 100,
        model: generated.model,
        tokens_in: generated.tokensIn,
        tokens_out: generated.tokensOut,
        cost_pence: generated.costPence,
        output: {
          mediaPlanId: mediaPlan.id,
          campaignIds,
          evidence,
        },
      })
      .eq("id", agentRun.id);
  }

  return {
    mediaPlanId: mediaPlan.id,
    campaignIds,
    directiveId: directive?.id ?? null,
    evidence,
    builtNotProven: true,
  };
}
