import "server-only";

import { generateSinglePostVariants } from "@/lib/agents/content/generate";
import { effectiveAutonomyMode, parseBrandAutonomy } from "@/lib/autonomy/settings";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";
import { getBrandContext } from "@/lib/brand/context";
import { runEntityComplianceCheck } from "@/lib/compliance/check";
import {
  computeCadenceGaps,
  formatBucket,
  resolveContentCadence,
  type CadenceSlotKind,
} from "@/lib/content/cadence";
import { autoAttachLibraryImage } from "@/lib/media/select";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";
import type { Brand } from "@/lib/types/research";

const HORIZON_DAYS = 7;
/** Cap Claude spend per brand per cron tick. */
const MAX_GAPS_PER_BRAND = 14;

function topicForGap(params: {
  brandName: string;
  platform: ContentPlatform;
  kind: CadenceSlotKind;
  pillarName: string | null;
  date: string;
  feedCopyHint?: string | null;
}) {
  if (params.kind === "story") {
    if (params.feedCopyHint) {
      return `Light Instagram Story visual — repurpose or tease this feed idea: ${params.feedCopyHint.slice(0, 180)}. Keep caption under 80 chars.`;
    }
    return `Light Instagram Story moment for ${params.brandName}${params.pillarName ? ` (${params.pillarName} pillar)` : ""} on ${params.date}. Short hook, visual-first, under 80 chars.`;
  }
  return `${params.platform} feed post for ${params.brandName}${params.pillarName ? ` — pillar: ${params.pillarName}` : ""} scheduled ${params.date}.`;
}

export async function fillBrandContentCadence(params: {
  organizationId: string;
  brandId: string;
  /** Override max gaps for tests / manual runs. */
  maxGaps?: number;
}): Promise<{
  brandId: string;
  gapsFound: number;
  filled: number;
  skipped: number;
  errors: string[];
}> {
  const supabase = createAdminClient();
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("*")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .single();
  if (brandErr || !brand) {
    throw new Error(brandErr?.message ?? "Brand not found");
  }

  const brandRow = brand as Brand & { content_cadence?: unknown };
  if (brandRow.agent_activity_paused) {
    return {
      brandId: params.brandId,
      gapsFound: 0,
      filled: 0,
      skipped: 0,
      errors: ["agent_activity_paused"],
    };
  }

  const enabled = await getBrandEnabledContentPlatforms({
    organizationId: params.organizationId,
    brandId: params.brandId,
    admin: true,
  });
  const targets = resolveContentCadence(brandRow.content_cadence, enabled);
  if (!targets.length) {
    return {
      brandId: params.brandId,
      gapsFound: 0,
      filled: 0,
      skipped: 0,
      errors: [],
    };
  }

  const from = new Date();
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + HORIZON_DAYS);

  const { data: existing } = await supabase
    .from("content_items")
    .select("id, platform, format, scheduled_at, status, copy")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .not("status", "eq", "rejected")
    .gte("scheduled_at", start.toISOString())
    .lt("scheduled_at", end.toISOString())
    .limit(2000);

  const counts = new Map<string, number>();
  const feedHints = new Map<string, string>();
  for (const item of existing ?? []) {
    if (!item.scheduled_at) continue;
    const date = item.scheduled_at.slice(0, 10);
    const kind = formatBucket(item.format as ContentFormat);
    const key = `${date}|${item.platform}|${kind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (kind === "feed" && item.copy && !feedHints.has(date)) {
      feedHints.set(date, String(item.copy));
    }
  }

  const gaps = computeCadenceGaps({
    targets,
    existingCounts: counts,
    horizonDays: HORIZON_DAYS,
    fromDate: from,
  });
  const maxGaps = params.maxGaps ?? MAX_GAPS_PER_BRAND;
  const toFill = gaps.slice(0, maxGaps);

  const autonomy = parseBrandAutonomy(brandRow);
  const organicMode = effectiveAutonomyMode(autonomy, "organic_social");
  const contentMode = effectiveAutonomyMode(autonomy, "content");
  // Autonomous brands still land in pending_approval — CMO reviews and schedules.
  const cmoOwnsApproval =
    organicMode === "autonomous" || contentMode === "autonomous";

  const brandContext = await getBrandContext(
    params.organizationId,
    params.brandId,
    { admin: true },
  );
  const pillars = brandContext.pillars;
  let pillarIdx = 0;

  let filled = 0;
  let skipped = 0;
  const errors: string[] = [];
  const createdIds: string[] = [];

  for (const gap of toFill) {
    const pillar = pillars.length
      ? pillars[pillarIdx % pillars.length]!
      : null;
    pillarIdx += 1;

    try {
      const { data: agentRun, error: runErr } = await supabase
        .from("agent_runs")
        .insert({
          organization_id: params.organizationId,
          module: "content",
          agent_name: "content_cadence_fill",
          status: "running",
          progress: 10,
          input: {
            brandId: params.brandId,
            gap,
            pillarId: pillar?.id ?? null,
          },
        })
        .select("id")
        .single();
      if (runErr || !agentRun) {
        throw new Error(runErr?.message ?? "agent_run insert failed");
      }

      const topic = topicForGap({
        brandName: brandRow.name,
        platform: gap.platform,
        kind: gap.kind,
        pillarName: pillar?.name ?? null,
        date: gap.date,
        feedCopyHint:
          gap.kind === "story" ? (feedHints.get(gap.date) ?? null) : null,
      });

      const generated = await generateSinglePostVariants({
        brandContext,
        platform: gap.platform,
        format: gap.format,
        pillarName: pillar?.name,
        topic,
      });

      const variant = generated.data.variants[0];
      if (!variant) {
        throw new Error("No variants returned");
      }

      const status = "pending_approval" as const;

      const { data: item, error: itemErr } = await supabase
        .from("content_items")
        .insert({
          organization_id: params.organizationId,
          brand_id: params.brandId,
          pillar_id: pillar?.id ?? null,
          platform: gap.platform,
          format: gap.format,
          status,
          title:
            variant.title ??
            `${gap.platform} ${gap.kind} ${gap.date}`.slice(0, 80),
          copy: variant.copy,
          hashtags: gap.kind === "story" ? [] : variant.hashtags,
          structured: {
            ...variant.structured,
            rationale: variant.rationale,
            cadence_fill: true,
            cadence_kind: gap.kind,
          },
          ai_generated: true,
          scheduled_at: gap.scheduledAt,
          agent_run_id: agentRun.id,
        })
        .select("id")
        .single();
      if (itemErr || !item) {
        throw new Error(itemErr?.message ?? "content insert failed");
      }

      await runEntityComplianceCheck({
        organizationId: params.organizationId,
        brandId: params.brandId,
        entityType: "content",
        entityId: item.id,
        title: variant.title ?? null,
        body: variant.copy,
        extra: {
          platform: gap.platform,
          format: gap.format,
          hashtags: variant.hashtags,
          structured: variant.structured,
        },
        syncContentFlags: true,
      });

      try {
        await autoAttachLibraryImage({
          organizationId: params.organizationId,
          brandId: params.brandId,
          contentItemId: item.id,
          topic,
          title: variant.title,
          copy: variant.copy,
          hardExcludeRecentDays: 14,
        });
      } catch {
        // media optional for feed; IG story without image will fail at publish
      }

      createdIds.push(item.id);

      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          progress: 100,
          model: generated.model,
          tokens_in: generated.tokensIn,
          tokens_out: generated.tokensOut,
          cost_pence: generated.costPence,
          output: { itemId: item.id, status, gap, cmoOwnsApproval },
        })
        .eq("id", agentRun.id);

      filled += 1;
      if (gap.kind === "feed") {
        feedHints.set(gap.date, variant.copy);
      }
    } catch (err) {
      skipped += 1;
      errors.push(
        `${gap.date} ${gap.platform}/${gap.kind}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }

  if (createdIds.length > 0) {
    if (cmoOwnsApproval) {
      const { queueCmoReviewForItems } = await import("@/lib/cmo/run");
      await queueCmoReviewForItems({
        organizationId: params.organizationId,
        brandId: params.brandId,
        itemIds: createdIds,
      });
    } else {
      const { notifyApprovalsNeeded } = await import(
        "@/lib/notifications/notify"
      );
      await notifyApprovalsNeeded({
        organizationId: params.organizationId,
        title: `${createdIds.length} cadence items awaiting approval`,
        body: "Review the content queue to keep the calendar filled.",
        link: "/content/queue",
      }).catch(() => undefined);
    }
  }

  return {
    brandId: params.brandId,
    gapsFound: gaps.length,
    filled,
    skipped,
    errors,
  };
}

export async function fillAllBrandsContentCadence() {
  const supabase = createAdminClient();
  const { data: brands } = await supabase
    .from("brands")
    .select("id, organization_id, agent_activity_paused")
    .eq("agent_activity_paused", false)
    .limit(200);

  const results = [];
  for (const b of brands ?? []) {
    try {
      results.push(
        await fillBrandContentCadence({
          organizationId: b.organization_id,
          brandId: b.id,
        }),
      );
    } catch (err) {
      results.push({
        brandId: b.id,
        gapsFound: 0,
        filled: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "failed"],
      });
    }
  }
  return results;
}
