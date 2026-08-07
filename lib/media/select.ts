import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { attachAssetToContentItem } from "@/lib/media/sync";
import type { MediaAsset } from "@/lib/types/media";

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
  // Prefer tagged assets over untagged dumps
  if ((asset.tags ?? []).length > 0 || asset.description) score += 1;
  return score;
}

/**
 * Pick the best library image for a content topic.
 * Prefers assets not attached to content in the last 14 days.
 * Returns null when nothing scores above a minimal threshold.
 */
export async function selectBestLibraryImage(params: {
  organizationId: string;
  brandId: string;
  topic: string;
  title?: string | null;
  copy?: string | null;
  /** When set, never pick assets used in content within this many days. */
  hardExcludeRecentDays?: number;
}): Promise<string | null> {
  const supabase = createAdminClient();
  const topicTokens = tokenize(
    [params.topic, params.title ?? "", params.copy?.slice(0, 400) ?? ""].join(
      " ",
    ),
  );
  if (topicTokens.size === 0) return null;

  const recentDays = params.hardExcludeRecentDays ?? RECENT_DAYS;
  const since = new Date();
  since.setDate(since.getDate() - recentDays);

  const [{ data: assets }, { data: recentLinks }] = await Promise.all([
    supabase
      .from("media_assets")
      .select(
        "id, tags, description, ai_subject, ai_style, ai_colors, suitable_for, filename, type",
      )
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .in("type", ["image", "logo"])
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("content_item_media")
      .select("media_asset_id, created_at")
      .eq("organization_id", params.organizationId)
      .gte("created_at", since.toISOString()),
  ]);

  if (!assets?.length) return null;

  const recentlyUsedIds = new Set(
    (recentLinks ?? []).map((r) => r.media_asset_id as string),
  );

  let bestId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const asset of assets) {
    const recentlyUsed = recentlyUsedIds.has(asset.id);
    if (params.hardExcludeRecentDays != null && recentlyUsed) {
      continue;
    }
    const score = scoreAsset(asset as MediaAsset, topicTokens, recentlyUsed);
    if (score > bestScore) {
      bestScore = score;
      bestId = asset.id;
    }
  }

  // Require at least one real token match
  return bestScore >= 3 ? bestId : null;
}

export async function autoAttachLibraryImage(params: {
  organizationId: string;
  brandId: string;
  contentItemId: string;
  topic: string;
  title?: string | null;
  copy?: string | null;
  hardExcludeRecentDays?: number;
}): Promise<{ attached: boolean; assetId: string | null }> {
  const assetId = await selectBestLibraryImage(params);
  if (!assetId) return { attached: false, assetId: null };

  await attachAssetToContentItem({
    organizationId: params.organizationId,
    contentItemId: params.contentItemId,
    mediaAssetId: assetId,
    replace: true,
  });

  return { attached: true, assetId };
}
