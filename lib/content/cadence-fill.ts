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
import {
  assignScheduleSlotUnderCadence,
  cadenceCountKey,
  CADENCE_OCCUPYING_STATUSES,
  loadCadenceOccupancyCounts,
} from "@/lib/content/schedule-slots";
import {
  findRecentNearDuplicate,
  loadRecentTopicsForDedupe,
  wouldNearDuplicateBeforeGeneration,
} from "@/lib/content/topic-dedupe";
import { isNearDuplicateTopic } from "@/lib/content/topic-similarity";
import {
  attachSelectedLibraryImage,
  platformRequiresLibraryImage,
  selectBestLibraryImageForContent,
} from "@/lib/media/select";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";
import type { Brand } from "@/lib/types/research";

const HORIZON_DAYS = 7;
/**
 * Cap Claude spend per brand per cron tick.
 * 1/1/1/1 across 4 platforms × 7 days = 28; leave headroom for backfill.
 */
const MAX_GAPS_PER_BRAND = 28;

const DIVERSITY_ANGLES = [
  "guest experience tip",
  "destination highlight",
  "value / price transparency",
  "booking confidence (deposit, cancellation)",
  "local culture moment",
  "packing / travel prep",
  "behind-the-scenes brand story",
  "myth-busting with a fresh claim (not previously used)",
  "seasonal timing hook",
  "social proof / traveler story angle",
];

function topicBriefForGap(params: {
  brandName: string;
  platform: ContentPlatform;
  kind: CadenceSlotKind;
  pillarName: string | null;
  date: string;
  feedCopyHint?: string | null;
  angle: string;
}) {
  if (params.kind === "story") {
    const platformLabel =
      params.platform === "facebook" ? "Facebook Story" : "Instagram Story";
    if (params.feedCopyHint) {
      return `Light ${platformLabel} visual — different angle (${params.angle}) teasing: ${params.feedCopyHint.slice(0, 140)}. Keep caption under 80 chars.`;
    }
    return `Light ${platformLabel} moment for ${params.brandName}${params.pillarName ? ` (${params.pillarName} pillar)` : ""} on ${params.date}. Angle: ${params.angle}. Short hook, visual-first, under 80 chars.`;
  }
  return `${params.platform} feed post for ${params.brandName}${params.pillarName ? ` — pillar: ${params.pillarName}` : ""} scheduled ${params.date}. Fresh angle: ${params.angle}. Distinct title/topic from recent calendar.`;
}

function topicPromptForGap(params: {
  brandName: string;
  platform: ContentPlatform;
  kind: CadenceSlotKind;
  pillarName: string | null;
  date: string;
  feedCopyHint?: string | null;
  angle: string;
  avoidTopics: string[];
}) {
  const brief = topicBriefForGap(params);
  if (params.avoidTopics.length === 0) return brief;
  const avoid = ` Do NOT reuse these recent topics/titles (or close paraphrases): ${params.avoidTopics
    .slice(0, 12)
    .map((t) => `"${t.slice(0, 80)}"`)
    .join("; ")}.`;
  return `${brief}${avoid}`;
}

export async function fillBrandContentCadence(params: {
  organizationId: string;
  brandId: string;
  /** Override max gaps for tests / manual runs. */
  maxGaps?: number;
  /**
   * Admin/ops only: run fill while agent_activity_paused remains true.
   * Does not unpause the brand.
   */
  ignoreAgentHalt?: boolean;
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
  if (brandRow.agent_activity_paused && !params.ignoreAgentHalt) {
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

  // Pending backlog occupies slots — include it so fill does not stack on the same day.
  const counts = await loadCadenceOccupancyCounts({
    organizationId: params.organizationId,
    brandId: params.brandId,
    fromDate: from,
    horizonDays: HORIZON_DAYS,
    statuses: CADENCE_OCCUPYING_STATUSES,
  });

  // Feed hints + avoid list may include pending (for copy context / diversity).
  const { data: existing } = await supabase
    .from("content_items")
    .select("id, platform, format, scheduled_at, status, copy, title")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .in("status", [...CADENCE_OCCUPYING_STATUSES])
    .gte("scheduled_at", start.toISOString())
    .lt("scheduled_at", end.toISOString())
    .limit(2000);

  const feedHints = new Map<string, string>();
  for (const item of existing ?? []) {
    if (!item.scheduled_at) continue;
    const date = item.scheduled_at.slice(0, 10);
    const kind = formatBucket(item.format as ContentFormat);
    if (kind === "feed" && item.copy && !feedHints.has(date)) {
      feedHints.set(date, String(item.copy));
    }
  }

  const recentTopics = await loadRecentTopicsForDedupe({
    organizationId: params.organizationId,
    brandId: params.brandId,
    days: 14,
  });
  const avoidTopics = recentTopics.map((t) => t.title);

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
  let angleIdx = 0;

  let filled = 0;
  let skipped = 0;
  const errors: string[] = [];
  const createdIds: string[] = [];
  const sessionTitles: string[] = [...avoidTopics];

  const sessionCounts = new Map(counts);

  for (const gap of toFill) {
    const pillar = pillars.length
      ? pillars[pillarIdx % pillars.length]!
      : null;
    pillarIdx += 1;

    let angle = DIVERSITY_ANGLES[angleIdx % DIVERSITY_ANGLES.length]!;
    const gapTopicBase = {
      brandName: brandRow.name,
      platform: gap.platform,
      kind: gap.kind,
      pillarName: pillar?.name ?? null,
      date: gap.date,
      feedCopyHint:
        gap.kind === "story" ? (feedHints.get(gap.date) ?? null) : null,
      angle,
    };
    let topic = topicPromptForGap({
      ...gapTopicBase,
      avoidTopics: sessionTitles,
    });
    // Pre-check only against real calendar titles — not the template brief, which
    // reuses angle phrases Claude often echoes into titles (false session dups).
    let preDupe = wouldNearDuplicateBeforeGeneration({
      candidate: `${gap.platform} ${gap.kind} ${gap.date} ${angle}`,
      sessionTitles: [],
      recentTopics,
    });
    let angleAttempts = 0;
    while (preDupe && angleAttempts < DIVERSITY_ANGLES.length - 1) {
      angleAttempts += 1;
      angleIdx += 1;
      angle = DIVERSITY_ANGLES[angleIdx % DIVERSITY_ANGLES.length]!;
      const nextBase = { ...gapTopicBase, angle };
      topic = topicPromptForGap({
        ...nextBase,
        avoidTopics: sessionTitles,
      });
      preDupe = wouldNearDuplicateBeforeGeneration({
        candidate: `${gap.platform} ${gap.kind} ${gap.date} ${angle}`,
        sessionTitles: [],
        recentTopics,
      });
    }
    angleIdx += 1;

    if (preDupe) {
      skipped += 1;
      errors.push(
        `${gap.date} ${gap.platform}/${gap.kind}: pre-check near-duplicate (${preDupe.source}) — skipped without Claude`,
      );
      continue;
    }

    try {
      const slotKey = cadenceCountKey(gap.date, gap.platform, gap.kind);
      const cap =
        targets.find(
          (t) => t.platform === gap.platform && t.kind === gap.kind,
        )?.perDay ?? 1;
      if ((sessionCounts.get(slotKey) ?? 0) >= cap) {
        skipped += 1;
        errors.push(
          `${gap.date} ${gap.platform}/${gap.kind}: session cap reached — skipped`,
        );
        continue;
      }

      const imagePick = await selectBestLibraryImageForContent({
        organizationId: params.organizationId,
        brandId: params.brandId,
        topic,
        pillarName: pillar?.name ?? null,
        hardExcludeRecentDays: 14,
        platform: gap.platform,
        format: gap.format,
      });

      // Image-first: never burn Claude on caption-only for visual platforms.
      if (platformRequiresLibraryImage(gap.platform) && !imagePick) {
        skipped += 1;
        errors.push(
          `${gap.date} ${gap.platform}/${gap.kind}: no suitable library image — held without generating`,
        );
        continue;
      }

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
            angle,
            imageAssetId: imagePick?.assetId ?? null,
          },
        })
        .select("id")
        .single();
      if (runErr || !agentRun) {
        throw new Error(runErr?.message ?? "agent_run insert failed");
      }

      const generated = await generateSinglePostVariants({
        brandContext,
        platform: gap.platform,
        format: gap.format,
        pillarName: pillar?.name,
        topic,
        imageContext: imagePick?.context ?? null,
      });

      const variant = generated.data.variants[0];
      if (!variant) {
        throw new Error("No variants returned");
      }

      const title =
        variant.title ??
        `${gap.platform} ${gap.kind} ${gap.date}`.slice(0, 80);

      const dupInSession = sessionTitles.find((t) =>
        isNearDuplicateTopic(title, t),
      );
      if (dupInSession) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            error: null,
            model: generated.model,
            tokens_in: generated.tokensIn,
            tokens_out: generated.tokensOut,
            cost_pence: generated.costPence,
            output: {
              skipped: "near_duplicate",
              reason: `Near-duplicate topic skipped: similar to "${dupInSession.slice(0, 80)}"`,
              title,
            },
          })
          .eq("id", agentRun.id);
        skipped += 1;
        errors.push(
          `${gap.date} ${gap.platform}/${gap.kind}: near-duplicate of "${dupInSession.slice(0, 60)}"`,
        );
        continue;
      }

      const dupRecent = await findRecentNearDuplicate({
        organizationId: params.organizationId,
        brandId: params.brandId,
        title,
        copy: variant.copy,
      });
      if (dupRecent) {
        await supabase
          .from("agent_runs")
          .update({
            status: "complete",
            progress: 100,
            error: null,
            model: generated.model,
            tokens_in: generated.tokensIn,
            tokens_out: generated.tokensOut,
            cost_pence: generated.costPence,
            output: {
              skipped: "near_duplicate",
              reason: `Near-duplicate of recent item ${dupRecent.id}`,
              match: dupRecent,
            },
          })
          .eq("id", agentRun.id);
        skipped += 1;
        errors.push(
          `${gap.date} ${gap.platform}/${gap.kind}: near-duplicate of "${dupRecent.title.slice(0, 60)}"`,
        );
        continue;
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
          title,
          copy: variant.copy,
          hashtags: gap.kind === "story" ? [] : variant.hashtags,
          structured: {
            ...variant.structured,
            rationale: variant.rationale,
            cadence_fill: true,
            cadence_kind: gap.kind,
            cadence_angle: angle,
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

      // Re-place under daily cap (pending backlog occupies slots).
      const placed = await assignScheduleSlotUnderCadence({
        organizationId: params.organizationId,
        brandId: params.brandId,
        itemId: item.id,
        platform: gap.platform,
        format: gap.format,
        preferredAt: gap.scheduledAt,
        forceWrite: true,
      });
      if (!placed.ok) {
        await supabase
          .from("content_items")
          .delete()
          .eq("id", item.id)
          .eq("organization_id", params.organizationId);
        throw new Error(placed.reason);
      }

      await runEntityComplianceCheck({
        organizationId: params.organizationId,
        brandId: params.brandId,
        entityType: "content",
        entityId: item.id,
        title,
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
        if (imagePick) {
          await attachSelectedLibraryImage({
            organizationId: params.organizationId,
            brandId: params.brandId,
            contentItemId: item.id,
            assetId: imagePick.assetId,
            platform: gap.platform,
            format: gap.format,
          });
        }
      } catch {
        // media optional for feed; IG story without image will fail at publish
      }

      sessionCounts.set(slotKey, (sessionCounts.get(slotKey) ?? 0) + 1);
      createdIds.push(item.id);
      sessionTitles.push(title);

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
            itemId: item.id,
            status,
            gap,
            scheduledAt: placed.scheduledAt,
            cmoOwnsApproval,
          },
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
