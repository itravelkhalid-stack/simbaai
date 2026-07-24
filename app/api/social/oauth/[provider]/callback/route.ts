import { NextResponse } from "next/server";

import { verifyOAuthState } from "@/lib/crypto";
import { upsertSocialConnection } from "@/lib/social/connections";
import { createLinkedInOAuthSession } from "@/lib/social/linkedin-connect";
import { createMetaOAuthSession } from "@/lib/social/meta-connect";
import { CONNECTABLE_PLATFORMS, getSocialProvider } from "@/lib/social/providers";
import type { ContentPlatform } from "@/lib/types/content";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function socialRedirect(query: string) {
  return `${siteUrl()}/social?${query}`;
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
    return NextResponse.redirect(socialRedirect("error=unknown_provider"));
  }

  if (oauthError) {
    return NextResponse.redirect(
      socialRedirect(`error=${encodeURIComponent(oauthError)}`),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(socialRedirect("error=missing_code"));
  }

  try {
    const payload = verifyOAuthState(state);
    if (payload.platform !== platform) {
      throw new Error("OAuth state platform mismatch");
    }

    const redirectUri = `${siteUrl()}/api/social/oauth/${platform}/callback`;

    if (platform === "facebook") {
      const session = await createMetaOAuthSession({
        organizationId: payload.org,
        brandId: payload.brand,
        code,
        redirectUri,
        createdBy: payload.user || null,
      });
      return NextResponse.redirect(
        `${siteUrl()}/social/meta/select?session=${session.id}`,
      );
    }

    if (platform === "linkedin") {
      const result = await createLinkedInOAuthSession({
        organizationId: payload.org,
        brandId: payload.brand,
        code,
        redirectUri,
        createdBy: payload.user || null,
      });
      if (result.kind === "member") {
        return NextResponse.redirect(socialRedirect("connected=linkedin"));
      }
      return NextResponse.redirect(
        `${siteUrl()}/social/linkedin/select?session=${result.session.id}`,
      );
    }

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

    return NextResponse.redirect(socialRedirect(`connected=${platform}`));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "OAuth callback failed";
    return NextResponse.redirect(
      socialRedirect(`error=${encodeURIComponent(message)}`),
    );
  }
}
