import type { AdPlatform } from "@/lib/types/ads";
import type { AdsProvider } from "@/lib/ads/providers/types";
import { bingAdsProvider } from "@/lib/ads/providers/bing";
import { googleAdsProvider } from "@/lib/ads/providers/google";
import { metaAdsProvider } from "@/lib/ads/providers/meta";
import { tiktokAdsProvider } from "@/lib/ads/providers/tiktok";
import { xAdsProvider } from "@/lib/ads/providers/x";

export const adsProviders: Record<AdPlatform, AdsProvider> = {
  meta: metaAdsProvider,
  tiktok: tiktokAdsProvider,
  google: googleAdsProvider,
  x: xAdsProvider,
  bing: bingAdsProvider,
};

export const AD_PLATFORMS: AdPlatform[] = [
  "meta",
  "tiktok",
  "google",
  "x",
  "bing",
];

export function getAdsProvider(platform: AdPlatform): AdsProvider {
  const provider = adsProviders[platform];
  if (!provider) throw new Error(`No ads provider for ${platform}`);
  return provider;
}
