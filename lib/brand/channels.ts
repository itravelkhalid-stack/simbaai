import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectionCanPublishInstagram } from "@/lib/social/meta-capabilities";
import type { ContentPlatform } from "@/lib/types/content";
import type { AdPlatform } from "@/lib/types/ads";
import {
  contentPlatformsFromChannels,
  isContentPlatform,
  normalizeBrandChannels,
  type BrandChannel,
} from "@/lib/brand/channel-types";

export type { BrandChannel } from "@/lib/brand/channel-types";
export {
  BRAND_CHANNEL_LABELS,
  BRAND_CHANNELS,
  CONTENT_PLATFORMS,
  contentPlatformsFromChannels,
  isContentPlatform,
} from "@/lib/brand/channel-types";

/** Derive channels from live social + ad connections for a brand. */
export async function deriveConnectedChannels(params: {
  organizationId: string;
  brandId: string;
  admin?: boolean;
}): Promise<BrandChannel[]> {
  const supabase = params.admin ? createAdminClient() : await createClient();
  const [{ data: social }, { data: ads }] = await Promise.all([
    supabase
      .from("social_connections")
      .select("platform, status, scopes, metadata")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("status", "active"),
    supabase
      .from("ad_connections")
      .select("platform, status")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("status", "active"),
  ]);

  const channels = new Set<BrandChannel>();
  for (const row of social ?? []) {
    const platform = String(row.platform);
    if (isContentPlatform(platform)) channels.add(platform);
    if (
      (platform === "facebook" || platform === "instagram") &&
      connectionCanPublishInstagram({
        scopes: (row.scopes as string[]) ?? [],
        metadata: (row.metadata as Record<string, unknown>) ?? {},
        platform: platform as "facebook" | "instagram",
      })
    ) {
      channels.add("instagram");
    }
  }
  for (const row of ads ?? []) {
    const platform = String(row.platform) as AdPlatform;
    if (platform === "google") channels.add("google");
    if (platform === "meta") {
      channels.add("facebook");
      channels.add("instagram");
    }
    if (platform === "tiktok") channels.add("tiktok");
    if (platform === "x") channels.add("x");
  }

  return Array.from(channels);
}

/**
 * Resolve enabled channels for a brand.
 * Explicit `enabled_channels` wins when non-empty; otherwise derive from connections.
 * Falls back to facebook+instagram when nothing is connected (safe default for content UI).
 */
export async function resolveEnabledChannels(params: {
  organizationId: string;
  brandId: string;
  stored?: unknown;
  admin?: boolean;
}): Promise<BrandChannel[]> {
  const stored = normalizeBrandChannels(params.stored);
  if (stored.length > 0) return stored;

  const derived = await deriveConnectedChannels(params);
  if (derived.length > 0) return derived;

  return ["facebook", "instagram"];
}

export async function resolveEnabledContentPlatforms(params: {
  organizationId: string;
  brandId: string;
  stored?: unknown;
  admin?: boolean;
}): Promise<ContentPlatform[]> {
  const channels = await resolveEnabledChannels(params);
  const platforms = contentPlatformsFromChannels(channels);
  return platforms.length > 0 ? platforms : ["facebook", "instagram"];
}

/** Load brand row + resolve content platforms (admin or RLS client). */
export async function getBrandEnabledContentPlatforms(params: {
  organizationId: string;
  brandId: string;
  admin?: boolean;
}): Promise<ContentPlatform[]> {
  const supabase = params.admin ? createAdminClient() : await createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("enabled_channels")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  return resolveEnabledContentPlatforms({
    organizationId: params.organizationId,
    brandId: params.brandId,
    stored: brand?.enabled_channels,
    admin: params.admin,
  });
}
