import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { attachAssetToContentItem } from "@/lib/media/sync";
import {
  assetQualifiesForSlot,
  canDeriveStoryFit,
  formatSlotForContent,
  isStoryMediaSlot,
} from "@/lib/media/format-fit";
import { deriveStoryFittedAsset } from "@/lib/media/story-fit";
import type { MediaAsset } from "@/lib/types/media";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";

const RECENT_DAYS = 14;

export type ImageVisionContext = {
  assetId: string;
  subject: string;
  setting: string;
  mood: string;
  colours: string[];
  description: string;
};

const SETTING_TAGS = new Set([
  "beach",
  "pool",
  "hotel",
  "resort",
  "airport",
  "city",
  "restaurant",
  "spa",
  "room",
  "balcony",
  "destination",
  "outdoor",
  "indoor",
  "sunset",
  "mountain",
  "coast",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3),
  );
}

function inferSetting(
  asset: Pick<
    MediaAsset,
    "description" | "tags" | "ai_subject" | "suitable_for"
  >,
): string {
  for (const tag of asset.tags ?? []) {
    const t = tag.toLowerCase();
    if (SETTING_TAGS.has(t)) return tag;
  }
  for (const tag of asset.suitable_for ?? []) {
    const t = tag.toLowerCase();
    if (SETTING_TAGS.has(t)) return tag;
  }
  const desc = asset.description ?? asset.ai_subject ?? "";
  const first = desc.split(/[.!?]/)[0]?.trim();
  return first && first.length <= 120 ? first : "unspecified";
}

export function buildImageVisionContext(
  asset: Pick<
    MediaAsset,
    | "id"
    | "ai_subject"
    | "ai_style"
    | "ai_colors"
    | "description"
    | "tags"
    | "suitable_for"
  >,
): ImageVisionContext {
  return {
    assetId: asset.id,
    subject: asset.ai_subject?.trim() || "unspecified",
    setting: inferSetting(asset),
    mood: asset.ai_style?.trim() || "neutral",
    colours: asset.ai_colors ?? [],
    description: asset.description?.trim() || "",
  };
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
  pillarTokens: Set<string>,
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
  for (const token of pillarTokens) {
    if (haystack.includes(token)) score += 6;
  }
  for (const tag of asset.tags ?? []) {
    if (topicTokens.has(tag.toLowerCase())) score += 4;
    if (pillarTokens.has(tag.toLowerCase())) score += 5;
  }
  for (const tag of asset.suitable_for ?? []) {
    if (topicTokens.has(tag.toLowerCase())) score += 5;
    if (pillarTokens.has(tag.toLowerCase())) score += 6;
  }
  if (asset.ai_subject) {
    for (const token of tokenize(asset.ai_subject)) {
      if (topicTokens.has(token)) score += 4;
      if (pillarTokens.has(token)) score += 5;
    }
  }
  if (recentlyUsed) score -= 12;
  if ((asset.tags ?? []).length > 0 || asset.description) score += 1;
  return score;
}

type SelectParams = {
  organizationId: string;
  brandId: string;
  topic: string;
  title?: string | null;
  copy?: string | null;
  pillarName?: string | null;
  hardExcludeRecentDays?: number;
  platform?: ContentPlatform;
  format?: ContentFormat;
  preferUnused?: boolean;
};

async function loadImageCandidates(params: SelectParams) {
  const supabase = createAdminClient();
  const topicTokens = tokenize(
    [params.topic, params.title ?? "", params.copy?.slice(0, 400) ?? ""].join(
      " ",
    ),
  );
  const pillarTokens = params.pillarName
    ? tokenize(params.pillarName)
    : new Set<string>();

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
    if (asset.is_derived && !isStoryMediaSlot(slot)) continue;
    if (recentlyUsedIds.has(asset.id)) continue;
    if (slot) {
      if (
        !assetQualifiesForSlot({
          suitableFormats: (asset.suitable_formats as string[]) ?? [],
          width: asset.width,
          height: asset.height,
          slot,
        })
      ) {
        continue;
      }
    }
    candidates.push(asset);
  }

  const neverUsed = candidates.filter((a) => !everUsedIds.has(a.id));
  const pool = neverUsed.length > 0 ? neverUsed : candidates;

  return {
    supabase,
    slot,
    topicTokens,
    pillarTokens,
    recentlyUsedIds,
    pool,
    assets,
  };
}

function pickBestFromPool(
  pool: Array<{
    id: string;
    tags: string[] | null;
    description: string | null;
    ai_subject: string | null;
    ai_style: string | null;
    ai_colors: string[] | null;
    suitable_for: string[] | null;
    filename: string;
  }>,
  topicTokens: Set<string>,
  pillarTokens: Set<string>,
  recentlyUsedIds: Set<string>,
  slot: ReturnType<typeof formatSlotForContent> | null,
): { assetId: string; row: (typeof pool)[number] } | null {
  if (!pool.length && isStoryMediaSlot(slot)) return null;

  let bestId: string | null = null;
  let bestRow: (typeof pool)[number] | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const asset of pool) {
    const recentlyUsed = recentlyUsedIds.has(asset.id);
    const score = scoreAsset(
      asset as MediaAsset,
      topicTokens,
      pillarTokens,
      recentlyUsed,
    );
    const effective =
      topicTokens.size === 0 && pillarTokens.size === 0 ? score + 3 : score;
    if (effective > bestScore) {
      bestScore = effective;
      bestId = asset.id;
      bestRow = asset;
    }
  }

  if (topicTokens.size > 0 && bestScore < 3 && slot == null) return null;
  if (!bestId || !bestRow) return null;
  return { assetId: bestId, row: bestRow };
}

/** Organic platforms that must not generate caption-only posts. */
export function platformRequiresLibraryImage(
  platform?: ContentPlatform | null,
): boolean {
  return (
    platform === "instagram" ||
    platform === "facebook" ||
    platform === "linkedin"
  );
}

export async function selectBestLibraryImageForContent(
  params: SelectParams,
): Promise<{ assetId: string; context: ImageVisionContext } | null> {
  const loaded = await loadImageCandidates(params);
  if (!loaded) return null;

  const picked = pickBestFromPool(
    loaded.pool,
    loaded.topicTokens,
    loaded.pillarTokens,
    loaded.recentlyUsedIds,
    loaded.slot,
  );
  if (!picked) return null;

  return {
    assetId: picked.assetId,
    context: buildImageVisionContext(picked.row as MediaAsset),
  };
}

export async function selectBestLibraryImage(
  params: SelectParams,
): Promise<string | null> {
  const pick = await selectBestLibraryImageForContent(params);
  return pick?.assetId ?? null;
}

export async function attachSelectedLibraryImage(params: {
  organizationId: string;
  contentItemId: string;
  assetId: string;
}) {
  await attachAssetToContentItem({
    organizationId: params.organizationId,
    contentItemId: params.contentItemId,
    mediaAssetId: params.assetId,
    replace: true,
  });
}

export async function loadImageVisionContextForAsset(params: {
  organizationId: string;
  assetId: string;
}): Promise<ImageVisionContext | null> {
  const supabase = createAdminClient();
  const { data: asset } = await supabase
    .from("media_assets")
    .select(
      "id, ai_subject, ai_style, ai_colors, description, tags, suitable_for",
    )
    .eq("id", params.assetId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!asset) return null;
  return buildImageVisionContext(asset as MediaAsset);
}

/**
 * Auto-attach a format-suitable library image. For IG/FB stories without 9:16,
 * derives a fitted asset when possible; otherwise sets awaiting note.
 */
export async function autoAttachLibraryImage(params: {
  organizationId: string;
  brandId: string;
  contentItemId: string;
  topic: string;
  title?: string | null;
  copy?: string | null;
  pillarName?: string | null;
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

  if (!assetId && isStoryMediaSlot(slot)) {
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

  await attachSelectedLibraryImage({
    organizationId: params.organizationId,
    contentItemId: params.contentItemId,
    assetId,
  });

  return { attached: true, assetId, awaitingNote: null };
}
