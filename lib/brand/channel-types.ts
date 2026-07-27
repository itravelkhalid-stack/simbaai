import type { ContentPlatform } from "@/lib/types/content";
import { PLATFORM_LABELS } from "@/lib/types/content";

/** Organic content platforms + Google Ads as a brand operating channel. */
export type BrandChannel = ContentPlatform | "google";

export const CONTENT_PLATFORMS: ContentPlatform[] = [
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "linkedin",
  "youtube",
  "pinterest",
];

export const BRAND_CHANNELS: BrandChannel[] = [
  ...CONTENT_PLATFORMS,
  "google",
];

export const BRAND_CHANNEL_LABELS: Record<BrandChannel, string> = {
  ...PLATFORM_LABELS,
  google: "Google Ads",
};

const CONTENT_PLATFORM_SET = new Set<string>(CONTENT_PLATFORMS);

export function isContentPlatform(value: string): value is ContentPlatform {
  return CONTENT_PLATFORM_SET.has(value);
}

export function contentPlatformsFromChannels(
  channels: readonly string[],
): ContentPlatform[] {
  return channels.filter(isContentPlatform);
}

export function normalizeBrandChannels(raw: unknown): BrandChannel[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(BRAND_CHANNELS);
  const out: BrandChannel[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = item.trim().toLowerCase();
    if (allowed.has(key) && !out.includes(key as BrandChannel)) {
      out.push(key as BrandChannel);
    }
  }
  return out;
}
