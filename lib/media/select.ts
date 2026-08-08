import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { attachAssetToContentItem } from "@/lib/media/sync";
import {
  assetFitsSlot,
  canDeriveStoryFit,
  formatSlotForContent,
} from "@/lib/media/format-fit";
import { deriveStoryFittedAsset } from "@/lib/media/story-fit";
import type { MediaAsset } from "@/lib/types/media";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";

const RECENT_DAYS = 14;

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
}

function scoreAsset(
  asset: Pick<
    MediaAsset,
    | "tags"
    | "description"
    | "ai_subject"
    | "ai_style"
    | "ai_colors"
    | "suitable_for"
    | "filename"
  >,
  topicTokens: Set<string>,
  recentlyUsed: boolean,
): number {
  const haystack = [
    ...(asset.tags ?? []),
    ...(asset.suitable_for ?? []),
    ...(asset.ai_colors ?? []),
    asset.description ?? "",
    asset.ai_subject ?? "",
    asset.ai_style ?? "",
    asset.filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const token of topicTokens) {
    if (haystack.includes(token)) score += 3;
  }
  for (const tag of asset.tags ?? []) {
    if (topicTokens.has(tag.toLowerCase())) score += 4;
  }
  for (const tag of asset.suitable_for ?? []) {
    if (topicTokens.has(tag.toLowerCase())) score += 5;
  }
  if (asset.ai_subject) {
    for (const token of tokenize(asset.ai_subject)) {
      if (topicTokens.has(token)) score += 4;
    }
  }
  if (recentlyUsed) score -= 12;
  if ((asset.tags ?? []).length > 0 || asset.description) score += 1;
  return score;
}

export async function selectBestLibraryImage(params: {
  organizationId: string;
  brandId: string;
  topic: string;
  title?: string | null;
  copy?: string | null;
  hardExcludeRecentDays?: number;
  platform?: ContentPlatform;
  format?: ContentFormat;
  /** Prefer never-used; allow used-over-avg only when no unused fits (Phase 5b simplified: prefer unused). */
  preferUnused?: boolean;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const topicTokens = tokenize(
    [params.topic, params.title ?? "", params.copy?.slice(0, 400) ?? ""].join(
      " ",
    ),
  );

  const recentDays = params.hardExcludeRecentDays ?? RECENT_DAYS;
  const since = new Date();
  since.setDate(since.getDate() - recentDays);

  const slot =
    params.platform && params.format
      ? formatSlotForContent(params.platform, params.format)
      : null;

  const [{ data: assets }, { data: recentUsages }, { data: allUsages }] =
    await Promise.all([
      supabase
        .from("media_assets")
        .select(
          "id, tags, description, ai_subject, ai_style, ai_colors, suitable_for, suitable_formats, filename, type, width, height, is_derived",
        )
        .eq("organization_id", params.organizationId)
        .eq("brand_id", params.brandId)
        .in("type", ["image", "logo"])
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("media_asset_usages")
        .select("media_asset_id")
        .eq("organization_id", params.organizationId)
        .gte("used_at", since.toISOString()),
      supabase
        .from("media_asset_usages")
        .select("media_asset_id")
        .eq("organization_id", params.organizationId)
        .eq("brand_id", params.brandId)
        .limit(2000),
    ]);

  if (!assets?.length) return null;

  const recentlyUsedIds = new Set(
    (recentUsages ?? []).map((r) => r.media_asset_id as string),
  );
  const everUsedIds = new Set(
    (allUsages ?? []).map((r) => r.media_asset_id as string),
  );

  type Row = (typeof assets)[number];
  const candidates: Row[] = [];
  for (const asset of assets) {
    if (asset.is_derived && slot !== "instagram_story") continue;
    // Never reuse within the 14-day window
    if (recentlyUsedIds.has(asset.id)) continue;
    if (slot) {
      const suitable = (asset.suitable_formats as string[]) ?? [];
      if (!assetFitsSlot(suitable, slot)) continue;
    }
    candidates.push(asset);
  }

  // Prefer never-used; allow previously-used (outside 14d window) only if none unused
  const neverUsed = candidates.filter((a) => !everUsedIds.has(a.id));
  const pool = neverUsed.length > 0 ? neverUsed : candidates;

  if (!pool.length && slot === "instagram_story") {
    return null;
  }
  const searchPool = pool;

  let bestId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const asset of searchPool) {
    const recentlyUsed = recentlyUsedIds.has(asset.id);
    const score = scoreAsset(asset as MediaAsset, topicTokens, recentlyUsed);
    // When topic tokens empty, still allow format-fit only picks
    const effective = topicTokens.size === 0 ? score + 3 : score;
    if (effective > bestScore) {
      bestScore = effective;
      bestId = asset.id;
    }
  }

  if (topicTokens.size > 0 && bestScore < 3 && slot == null) return null;
  return bestId;
}

/**
 * Auto-attach a format-suitable library image. For IG stories without 9:16,
 * derives a fitted asset when possible; otherwise sets awaiting note.
 */
export async function autoAttachLibraryImage(params: {
  organizationId: string;
  brandId: string;
  contentItemId: string;
  topic: string;
  title?: string | null;
  copy?: string | null;
  hardExcludeRecentDays?: number;
  platform?: ContentPlatform;
  format?: ContentFormat;
}): Promise<{
  attached: boolean;
  assetId: string | null;
  awaitingNote: string | null;
}> {
  const supabase = createAdminClient();
  const slot =
    params.platform && params.format
      ? formatSlotForContent(params.platform, params.format)
      : null;

  let assetId = await selectBestLibraryImage({
    ...params,
    preferUnused: true,
  });

  if (!assetId && slot === "instagram_story") {
    // Pick any recent image we can derive from
    const { data: sources } = await supabase
      .from("media_assets")
      .select("id, width, height")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .in("type", ["image", "logo"])
      .eq("is_derived", false)
      .order("created_at", { ascending: false })
      .limit(40);
    const source = (sources ?? []).find((s) =>
      canDeriveStoryFit(s.width, s.height),
    );
    if (source) {
      const derived = await deriveStoryFittedAsset({
        organizationId: params.organizationId,
        brandId: params.brandId,
        sourceAssetId: source.id,
      });
      assetId = derived?.assetId ?? null;
    }
    if (!assetId) {
      const note = "awaiting story-format image";
      await supabase
        .from("content_items")
        .update({
          cmo_note: note,
          status: "pending_approval",
        })
        .eq("id", params.contentItemId);
      return { attached: false, assetId: null, awaitingNote: note };
    }
  }

  if (!assetId) {
    const needsImage =
      params.platform === "instagram" ||
      params.platform === "linkedin" ||
      params.platform === "facebook";
    if (needsImage) {
      const note = "awaiting image";
      await supabase
        .from("content_items")
        .update({ cmo_note: note, status: "pending_approval" })
        .eq("id", params.contentItemId)
        .eq("organization_id", params.organizationId);
      return { attached: false, assetId: null, awaitingNote: note };
    }
    return { attached: false, assetId: null, awaitingNote: null };
  }

  await attachAssetToContentItem({
    organizationId: params.organizationId,
    contentItemId: params.contentItemId,
    mediaAssetId: assetId,
    replace: true,
  });

  return { attached: true, assetId, awaitingNote: null };
}
