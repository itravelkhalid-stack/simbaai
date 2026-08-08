import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";
import {
  assetFitsSlot,
  formatSlotForContent,
  type MediaFormatSlot,
  MEDIA_FORMAT_SLOT_LABELS,
} from "@/lib/media/format-fit";
import { resolveContentCadence } from "@/lib/content/cadence";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";

const RECENT_DAYS = 14;

export async function recordMediaAssetUsage(params: {
  organizationId: string;
  brandId: string;
  mediaAssetId: string;
  contentItemId: string;
  platform: ContentPlatform;
  format: ContentFormat;
}) {
  const supabase = createAdminClient();
  await supabase.from("media_asset_usages").insert({
    organization_id: params.organizationId,
    brand_id: params.brandId,
    media_asset_id: params.mediaAssetId,
    content_item_id: params.contentItemId,
    platform: params.platform,
    format: params.format,
    used_at: new Date().toISOString(),
  });
}

export async function recordUsagesForContentItem(params: {
  organizationId: string;
  brandId: string;
  contentItemId: string;
  platform: ContentPlatform;
  format: ContentFormat;
}) {
  const supabase = createAdminClient();
  const { data: links } = await supabase
    .from("content_item_media")
    .select("media_asset_id")
    .eq("content_item_id", params.contentItemId)
    .eq("organization_id", params.organizationId);
  for (const link of links ?? []) {
    await recordMediaAssetUsage({
      organizationId: params.organizationId,
      brandId: params.brandId,
      mediaAssetId: link.media_asset_id,
      contentItemId: params.contentItemId,
      platform: params.platform,
      format: params.format,
    });
  }
}

export type FormatInventoryRow = {
  slot: MediaFormatSlot;
  label: string;
  suitableCount: number;
  unusedCount: number;
  daysRemaining: number | null;
  ask: string | null;
};

export async function computeMediaInventoryHealth(params: {
  organizationId: string;
  brandId: string;
}): Promise<FormatInventoryRow[]> {
  const supabase = createAdminClient();
  const enabled = await getBrandEnabledContentPlatforms({
    organizationId: params.organizationId,
    brandId: params.brandId,
    admin: true,
  });
  const { data: brand } = await supabase
    .from("brands")
    .select("content_cadence")
    .eq("id", params.brandId)
    .maybeSingle();
  const targets = resolveContentCadence(brand?.content_cadence, enabled);

  const since = new Date();
  since.setDate(since.getDate() - RECENT_DAYS);

  const [{ data: assets }, { data: recentUsages }] = await Promise.all([
    supabase
      .from("media_assets")
      .select("id, suitable_formats, is_derived")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .in("type", ["image", "logo"])
      .eq("is_derived", false)
      .limit(500),
    supabase
      .from("media_asset_usages")
      .select("media_asset_id")
      .eq("brand_id", params.brandId)
      .gte("used_at", since.toISOString()),
  ]);

  const recentlyUsed = new Set(
    (recentUsages ?? []).map((u) => u.media_asset_id as string),
  );

  const slots: MediaFormatSlot[] = [
    "instagram_story",
    "instagram_feed",
    "facebook_story",
    "facebook_feed",
    "linkedin_feed",
  ];

  return slots.map((slot) => {
    const suitable = (assets ?? []).filter((a) =>
      assetFitsSlot((a.suitable_formats as string[]) ?? [], slot),
    );
    const unused = suitable.filter((a) => !recentlyUsed.has(a.id));
    const perDay = targets
      .filter((t) => formatSlotForContent(t.platform, t.format) === slot)
      .reduce((s, t) => s + t.perDay, 0);
    const daysRemaining =
      perDay > 0 ? Math.round((unused.length / perDay) * 10) / 10 : null;
    let ask: string | null = null;
    if (perDay > 0 && unused.length <= perDay) {
      const need = Math.max(perDay * 3 - unused.length, perDay);
      if (slot === "instagram_story" || slot === "facebook_story") {
        const label = slot === "instagram_story" ? "IG" : "FB";
        ask = `${label} stories: ${unused.length} suitable image${unused.length === 1 ? "" : "s"} left (~${daysRemaining ?? 0} days at cadence) — add ~${need} more 9:16 images`;
      } else {
        ask = `${MEDIA_FORMAT_SLOT_LABELS[slot]}: ${unused.length} left (~${daysRemaining ?? 0} days) — add ~${need} more`;
      }
    }
    return {
      slot,
      label: MEDIA_FORMAT_SLOT_LABELS[slot],
      suitableCount: suitable.length,
      unusedCount: unused.length,
      daysRemaining,
      ask,
    };
  });
}
