import { NextResponse } from "next/server";

import { verifyOAuthState } from "@/lib/crypto";
import {
  exchangeGa4Code,
  listGa4Properties,
  saveGa4Connection,
} from "@/lib/data/ga4";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (error) {
    return NextResponse.redirect(
      `${site}/data/settings?error=${encodeURIComponent(error)}`,
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(`${site}/data/settings?error=missing_code`);
  }

  try {
    const payload = verifyOAuthState(state);
    const brandId = payload.brandId;
    const organizationId = payload.organizationId;
    if (!brandId || !organizationId) throw new Error("Invalid OAuth state");

    const redirectUri = `${site}/api/data/ga4/callback`;
    const tokens = await exchangeGa4Code({ code, redirectUri });
    const properties = await listGa4Properties(tokens.accessToken);
    const preferred = properties[0];
    if (!preferred) {
      return NextResponse.redirect(
        `${site}/data/settings?error=${encodeURIComponent("No GA4 properties found")}`,
      );
    }

    await saveGa4Connection({
      organizationId,
      brandId,
      propertyId: preferred.propertyId,
      propertyName: preferred.displayName,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });

    const pick =
      properties.length > 1 ? "&ga4=pick" : "&ga4=connected";
    return NextResponse.redirect(`${site}/data/settings?brandId=${brandId}${pick}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ga4_oauth_failed";
    return NextResponse.redirect(
      `${site}/data/settings?error=${encodeURIComponent(message)}`,
    );
  }
}
