import type { ContentFormat, ContentPlatform } from "@/lib/types/content";

/** Slots used for library suitability + inventory. */
export type MediaFormatSlot =
  | "instagram_story"
  | "instagram_feed"
  | "facebook_story"
  | "facebook_feed"
  | "linkedin_feed";

export const MEDIA_FORMAT_SLOT_LABELS: Record<MediaFormatSlot, string> = {
  instagram_story: "IG Story 9:16",
  instagram_feed: "IG Feed",
  facebook_story: "FB Story 9:16",
  facebook_feed: "Facebook feed",
  linkedin_feed: "LinkedIn",
};

const RATIO_TOLERANCE = 0.08;

function ratio(w: number, h: number) {
  return w / h;
}

function near(actual: number, target: number, tol = RATIO_TOLERANCE) {
  return Math.abs(actual - target) / target <= tol;
}

/** True for vertical story media slots (IG + FB). */
export function isStoryMediaSlot(slot: MediaFormatSlot | null | undefined) {
  return slot === "instagram_story" || slot === "facebook_story";
}

/** Classify which format slots an image can serve from pixel dimensions. */
export function suitableFormatsForDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): MediaFormatSlot[] {
  if (!width || !height || width < 32 || height < 32) return [];
  const r = ratio(width, height);
  const out: MediaFormatSlot[] = [];

  // 9:16 story (IG + FB share the same visual format)
  if (near(r, 9 / 16) || (height > width && near(r, 0.5625, 0.12))) {
    out.push("instagram_story", "facebook_story");
  }
  // 1:1 or 4:5 IG feed
  if (near(r, 1) || near(r, 4 / 5)) {
    out.push("instagram_feed");
  }
  // Flexible landscape or square for FB/LI (up to ultra-wide banners)
  if (near(r, 1) || (width >= height && r <= 7)) {
    out.push("facebook_feed", "linkedin_feed");
  }
  // Portrait that isn't story can still be FB/LI occasionally as square-ish
  if (near(r, 4 / 5) && !out.includes("facebook_feed")) {
    out.push("facebook_feed", "linkedin_feed");
  }

  return Array.from(new Set(out));
}

export function formatSlotForContent(
  platform: ContentPlatform,
  format: ContentFormat,
): MediaFormatSlot | null {
  if (platform === "instagram" && format === "story") return "instagram_story";
  if (platform === "instagram") return "instagram_feed";
  if (platform === "facebook" && format === "story") return "facebook_story";
  if (platform === "facebook") return "facebook_feed";
  if (platform === "linkedin") return "linkedin_feed";
  return null;
}

export function assetFitsSlot(
  suitableFormats: string[] | null | undefined,
  slot: MediaFormatSlot,
): boolean {
  const list = suitableFormats ?? [];
  if (list.includes(slot)) return true;
  // IG/FB stories share 9:16 — accept either tag for either story slot
  if (slot === "facebook_story" && list.includes("instagram_story")) return true;
  if (slot === "instagram_story" && list.includes("facebook_story")) return true;
  return false;
}

/** True when we can derive a story fit from a non-9:16 image. */
export function canDeriveStoryFit(
  width: number | null | undefined,
  height: number | null | undefined,
): boolean {
  return Boolean(width && height && width >= 200 && height >= 200);
}
