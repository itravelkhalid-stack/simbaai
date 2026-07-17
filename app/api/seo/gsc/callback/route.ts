import { NextResponse } from "next/server";

import { verifyOAuthState } from "@/lib/crypto";
import {
  exchangeGscCode,
  listGscSites,
  saveGscTokens,
} from "@/lib/seo/gsc";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${site}/seo?error=${encodeURIComponent(error)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${site}/seo?error=missing_code`);
  }

  try {
    const payload = verifyOAuthState(state);
    const projectId = payload.projectId;
    const organizationId = payload.organizationId;
    if (!projectId || !organizationId) throw new Error("Invalid OAuth state");

    const redirectUri = `${site}/api/seo/gsc/callback`;
    const tokens = await exchangeGscCode({ code, redirectUri });
    const sites = await listGscSites(tokens.accessToken);
    const preferred =
      sites.find((s) => s.siteUrl.includes("sc-domain:"))?.siteUrl ??
      sites[0]?.siteUrl ??
      null;

    await saveGscTokens({
      projectId,
      organizationId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      siteUrl: preferred,
    });

    return NextResponse.redirect(
      `${site}/seo/projects/${projectId}?gsc=connected`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "gsc_oauth_failed";
    return NextResponse.redirect(
      `${site}/seo?error=${encodeURIComponent(message)}`,
    );
  }
}
