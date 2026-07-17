import type { ContentPlatform } from "@/lib/types/content";
import type { SocialProvider } from "@/lib/social/types";
import { facebookProvider } from "@/lib/social/providers/facebook";
import { instagramProvider } from "@/lib/social/providers/instagram";
import { linkedinProvider } from "@/lib/social/providers/linkedin";
import { pinterestProvider } from "@/lib/social/providers/pinterest";
import { tiktokProvider } from "@/lib/social/providers/tiktok";
import { xProvider } from "@/lib/social/providers/x";
import { youtubeProvider } from "@/lib/social/providers/youtube";

export const socialProviders: Record<ContentPlatform, SocialProvider> = {
  facebook: facebookProvider,
  instagram: instagramProvider,
  x: xProvider,
  linkedin: linkedinProvider,
  tiktok: tiktokProvider,
  pinterest: pinterestProvider,
  youtube: youtubeProvider,
};

export const CONNECTABLE_PLATFORMS: ContentPlatform[] = [
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "tiktok",
  "pinterest",
  "youtube",
];

export function getSocialProvider(platform: ContentPlatform): SocialProvider {
  const provider = socialProviders[platform];
  if (!provider) throw new Error(`No social provider for ${platform}`);
  return provider;
}
