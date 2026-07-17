import { NextResponse } from "next/server";

import { verifyOAuthState } from "@/lib/crypto";
import { upsertSocialConnection } from "@/lib/social/connections";
import { CONNECTABLE_PLATFORMS, getSocialProvider } from "@/lib/social/providers";
import type { ContentPlatform } from "@/lib/types/content";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await context.params;
  const platform = providerParam as ContentPlatform;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  if (!CONNECTABLE_PLATFORMS.includes(platform)) {
    return NextResponse.redirect(
      `${siteUrl()}/settings/connections?error=unknown_provider`,
    );
  }

  if (oauthError) {
    return NextResponse.redirect(
      `${siteUrl()}/settings/connections?error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${siteUrl()}/settings/connections?error=missing_code`,
    );
  }

  try {
    const payload = verifyOAuthState(state);
    if (payload.platform !== platform) {
      throw new Error("OAuth state platform mismatch");
    }

    const redirectUri = `${siteUrl()}/api/social/oauth/${platform}/callback`;
    const provider = getSocialProvider(platform);

    if (platform === "x" && payload.pkce_verifier) {
      (globalThis as { __xPkceVerifier?: string }).__xPkceVerifier =
        payload.pkce_verifier;
    }

    const tokens = await provider.exchangeCode({ code, redirectUri });
    await upsertSocialConnection({
      organizationId: payload.org,
      brandId: payload.brand,
      platform,
      tokens,
    });

    return NextResponse.redirect(
      `${siteUrl()}/settings/connections?connected=${platform}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth callback failed";
    return NextResponse.redirect(
      `${siteUrl()}/settings/connections?error=${encodeURIComponent(message)}`,
    );
  }
}
