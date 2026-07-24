import { NextResponse } from "next/server";

import { completeAdOAuth } from "@/lib/ads/oauth";
import type { AdPlatform } from "@/lib/types/ads";
import { AD_PLATFORMS } from "@/lib/ads/providers";
import { reportServerError } from "@/lib/observability/report";

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform: raw } = await context.params;
  const platform = raw as AdPlatform;
  if (!AD_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  if (error) {
    reportServerError(new Error(`oauth_provider_error:${error}`), {
      scope: "ads_oauth_callback",
      platform,
      provider_error: error,
    });
    return NextResponse.redirect(
      `${site}/ads/connections?error=${encodeURIComponent(error)}`,
    );
  }
  if (!code || !state) {
    reportServerError(new Error("oauth_missing_code_or_state"), {
      scope: "ads_oauth_callback",
      platform,
      has_code: String(Boolean(code)),
      has_state: String(Boolean(state)),
    });
    return NextResponse.redirect(`${site}/ads/connections?error=missing_code`);
  }

  try {
    await completeAdOAuth({ platform, code, state });
    return NextResponse.redirect(`${site}/ads/connections?connected=${platform}`);
  } catch (err) {
    reportServerError(err, {
      scope: "ads_oauth_callback",
      platform,
    });
    const message = err instanceof Error ? err.message : "oauth_failed";
    return NextResponse.redirect(
      `${site}/ads/connections?error=${encodeURIComponent(message)}`,
    );
  }
}
