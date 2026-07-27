import "server-only";

import { generateGrowthReview } from "@/lib/agents/content/growth";
import {
  authorizeAgentAction,
  recordAutonomousAction,
} from "@/lib/autonomy/authorize";
import {
  effectiveAutonomyMode,
  parseBrandAutonomy,
} from "@/lib/autonomy/settings";
import { getBrandContext } from "@/lib/brand/context";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";
import type { ContentItem } from "@/lib/types/content";
import type { Brand } from "@/lib/types/research";
import type { ContentMetric } from "@/lib/social/types";

function engagementScore(m: ContentMetric) {
  return m.likes + m.comments * 2 + m.shares * 3 + m.saves * 2 + m.clicks;
}

function buildMetricsMarkdown(
  items: ContentItem[],
  metrics: ContentMetric[],
) {
  const byItem = new Map<string, ContentMetric[]>();
  for (const row of metrics) {
    const arr = byItem.get(row.content_item_id) ?? [];
    arr.push(row);
    byItem.set(row.content_item_id, arr);
  }

  const lines: string[] = [];
  for (const item of items) {
    const rows = byItem.get(item.id) ?? [];
    if (rows.length === 0) continue;
    const latest = rows.sort((a, b) =>
      b.captured_at.localeCompare(a.captured_at),
    )[0];
    const score = engagementScore(latest);
    const hour = item.published_at
      ? new Date(item.published_at).getUTCHours()
      : null;
    lines.push(
      `- id=${item.id} | ${item.platform} | format=${item.format} | topic=${item.copy.slice(0, 80).replace(/\n/g, " ")} | published=${item.published_at ?? "n/a"} | utc_hour=${hour ?? "n/a"} | impressions=${latest.impressions} | reach=${latest.reach} | likes=${latest.likes} | comments=${latest.comments} | shares=${latest.shares} | saves=${latest.saves} | clicks=${latest.clicks} | engagement_score=${score}`,
    );
  }
  return lines.length > 0
    ? lines.join("\n")
    : "No content metrics available in this window.";
}

async function seedSuggestedSlots(params: {
  organizationId: string;
  brandId: string;
  planId: string;
  slots: Array<{
    platform: ContentPlatform;
    format: ContentFormat;
    topic: string;
    pillar_hint?: string;
    preferred_day_offset?: number;
  }>;
  startDate: string;
}) {
  const supabase = createAdminClient();
  const { data: pillars } = await supabase
    .from("content_pillars")
    .select("id, name")
    .eq("brand_id", params.brandId);
  const pillarByName = new Map(
    (pillars ?? []).map((p) => [String(p.name).toLowerCase(), p.id as string]),
  );

  const start = new Date(`${params.startDate}T10:00:00.000Z`);
  const rows = params.slots.slice(0, 12).map((slot, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + (slot.preferred_day_offset ?? index));
    return {
      organization_id: params.organizationId,
      plan_id: params.planId,
      pillar_id: slot.pillar_hint
        ? (pillarByName.get(slot.pillar_hint.toLowerCase()) ?? null)
        : null,
      platform: slot.platform,
      format: slot.format,
      topic: slot.topic,
      scheduled_at: day.toISOString(),
      status: "proposed" as const,
      sort_order: index,
    };
  });
  if (rows.length === 0) return 0;
  const { error } = await supabase.from("content_plan_slots").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function runWeeklyGrowthReviewForBrand(params: {
  organizationId: string;
  brandId: string;
}) {
  const supabase = createAdminClient();
  const { data: brand, error } = await supabase
    .from("brands")
    .select("*")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .single();
  if (error || !brand) throw new Error(error?.message ?? "Brand not found");

  const typedBrand = brand as Brand;
  const autonomy = parseBrandAutonomy(typedBrand);
  if (autonomy.agentActivityPaused) {
    return { skipped: true as const, reason: "agent_activity_paused" };
  }

  const mode = effectiveAutonomyMode(autonomy, "organic_social");
  const since = new Date();
  since.setDate(since.getDate() - 14);

  const { data: items } = await supabase
    .from("content_items")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("status", "published")
    .gte("published_at", since.toISOString())
    .order("published_at", { ascending: false })
    .limit(80);

  const list = (items ?? []) as ContentItem[];
  const itemIds = list.map((i) => i.id);
  const { data: metrics } = itemIds.length
    ? await supabase
        .from("content_metrics")
        .select("*")
        .eq("organization_id", params.organizationId)
        .in("content_item_id", itemIds)
    : { data: [] };

  const brandContext = await getBrandContext(
    params.organizationId,
    params.brandId,
    { admin: true },
  );
  const metricsMarkdown = buildMetricsMarkdown(
    list,
    (metrics ?? []) as ContentMetric[],
  );

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "content",
      agent_name: "organic_growth",
      status: "running",
      input: {
        brand_id: params.brandId,
        window_days: 14,
        posts: list.length,
        autonomy_mode: mode,
      },
      logs: [
        {
          at: new Date().toISOString(),
          message: "Running weekly organic growth review",
        },
      ],
      progress: 10,
      metered: false,
    })
    .select("id")
    .single();

  const generated = await generateGrowthReview({
    brandContext,
    metricsMarkdown,
    windowLabel: `Last 14 days (${list.length} published posts)`,
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

  // Attach brief to the newest draft/proposed content plan when present
  const { data: plan } = await supabase
    .from("content_plans")
    .select("id, brief, status, start_date")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .in("status", ["draft", "proposed"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let slotsSeeded = 0;
  if (plan) {
    const prior = (plan.brief as { notes?: string } | null) ?? {};
    await supabase
      .from("content_plans")
      .update({
        brief: {
          ...prior,
          notes: [
            prior.notes ?? "",
            "",
            "## Growth agent brief",
            generated.data.next_batch_brief,
            "",
            generated.data.summary,
          ]
            .filter(Boolean)
            .join("\n")
            .trim(),
          growth_review: generated.data,
          growth_agent_run_id: run?.id ?? null,
        },
      })
      .eq("id", plan.id);

    const auth = await authorizeAgentAction({
      organizationId: params.organizationId,
      brandId: params.brandId,
      channel: "organic_social",
      action: mode === "autonomous" ? "growth_execute" : "growth_propose",
      agentName: "organic_growth",
      entityType: "content_plan",
      entityId: plan.id,
      allowAsRecommendation: true,
    });

    if (auth.mayExecute && generated.data.suggested_slots.length > 0) {
      slotsSeeded = await seedSuggestedSlots({
        organizationId: params.organizationId,
        brandId: params.brandId,
        planId: plan.id,
        slots: generated.data.suggested_slots,
        startDate: plan.start_date,
      });
      await recordAutonomousAction({
        organizationId: params.organizationId,
        brandId: params.brandId,
        agentName: "organic_growth",
        action: "growth_execute",
        entityType: "content_plan",
        entityId: plan.id,
        summary: `Seeded ${slotsSeeded} proposed slots from weekly growth review`,
        after: { slots: slotsSeeded },
        link: `/content/plans/${plan.id}`,
      });
    } else {
      await recordAutonomousAction({
        organizationId: params.organizationId,
        brandId: params.brandId,
        agentName: "organic_growth",
        action: "growth_propose",
        entityType: "content_plan",
        entityId: plan.id,
        summary: `Growth review brief attached to plan (mode=${mode})`,
        after: { brief_updated: true },
        link: `/content/plans/${plan.id}`,
      });
    }
  } else {
    await recordAutonomousAction({
      organizationId: params.organizationId,
      brandId: params.brandId,
      agentName: "organic_growth",
      action: "growth_propose",
      entityType: "brand",
      entityId: params.brandId,
      summary: generated.data.summary.slice(0, 240),
      after: { next_batch_brief: generated.data.next_batch_brief },
      link: "/content",
    });
  }

  return {
    ok: true as const,
    agentRunId: run?.id ?? null,
    slotsSeeded,
    mode,
  };
}

export async function runWeeklyGrowthReviewAllBrands() {
  const supabase = createAdminClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, organization_id, agent_activity_paused")
    .eq("agent_activity_paused", false)
    .limit(200);

  const results = [];
  for (const brand of brands ?? []) {
    try {
      const result = await runWeeklyGrowthReviewForBrand({
        organizationId: brand.organization_id,
        brandId: brand.id,
      });
      results.push({ brandId: brand.id, ...result });
    } catch (error) {
      results.push({
        brandId: brand.id,
        ok: false,
        error: error instanceof Error ? error.message : "failed",
      });
    }
  }
  return results;
}
