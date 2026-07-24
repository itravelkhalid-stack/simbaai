import { NextResponse } from "next/server";

import { getAdsProvider, AD_PLATFORMS } from "@/lib/ads/providers";
import { signOAuthState } from "@/lib/crypto";
import { reportServerError } from "@/lib/observability/report";
import { requireActiveOrg } from "@/lib/org/require";
import type { AdPlatform } from "@/lib/types/ads";

/**
 * Start Ads OAuth via a normal HTTP redirect (same pattern as social).
 * Do not use a server action that redirect()s to an external URL — Next.js
 * fetch-based actions expect a Flight/JSON payload and surface
 * `Unexpected token '<', "<!DOCTYPE "...` when they get HTML instead.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform: raw } = await context.params;
  const platform = raw as AdPlatform;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (!AD_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  try {
    const { active } = await requireActiveOrg();
    if (active.role === "org_viewer") {
      return NextResponse.redirect(
        `${site}/ads/connections?error=${encodeURIComponent("Viewers cannot connect ad accounts")}`,
      );
    }

    const provider = getAdsProvider(platform);
    if (!provider.supportsOAuth || !provider.getAuthorizationUrl) {
      return NextResponse.redirect(
        `${site}/ads/connections?error=${encodeURIComponent("OAuth not configured for this platform")}`,
      );
    }

    const redirectUri = `${site}/api/ads/oauth/${platform}/callback`;
    const state = signOAuthState({
      organizationId: active.organization_id,
      platform,
      ts: String(Date.now()),
    });
    const authorizationUrl = provider.getAuthorizationUrl({ state, redirectUri });
    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    reportServerError(error, {
      scope: "ads_oauth_start",
      platform,
    });
    const message = error instanceof Error ? error.message : "oauth_start_failed";
    return NextResponse.redirect(
      `${site}/ads/connections?error=${encodeURIComponent(message)}`,
    );
  }
}
