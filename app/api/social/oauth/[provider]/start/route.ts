import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";

import { signOAuthState } from "@/lib/crypto";
import { requireActiveOrg } from "@/lib/org/require";
import { metaRequestIgScopesEnabled } from "@/lib/social/meta";
import { CONNECTABLE_PLATFORMS, getSocialProvider } from "@/lib/social/providers";
import { createClient } from "@/lib/supabase/server";
import type { ContentPlatform } from "@/lib/types/content";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider: providerParam } = await context.params;
  const platform = providerParam as ContentPlatform;

  if (!CONNECTABLE_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  if (platform === "instagram" && !metaRequestIgScopesEnabled()) {
    return NextResponse.redirect(
      `${siteUrl()}/social?error=${encodeURIComponent(
        "Instagram connect is disabled until META_REQUEST_IG_SCOPES=true",
      )}`,
    );
  }

  try {
    const { active } = await requireActiveOrg();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return NextResponse.json({ error: "Only owners/admins can connect" }, { status: 403 });
    }

    const supabase = await createClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("id")
      .eq("organization_id", active.organization_id)
      .eq("is_primary", true)
      .maybeSingle();

    if (!brand) {
      return NextResponse.json({ error: "No brand found" }, { status: 400 });
    }

    const redirectUri = `${siteUrl()}/api/social/oauth/${platform}/callback`;
    const nonce = randomBytes(16).toString("hex");
    const statePayload: Record<string, string> = {
      org: active.organization_id,
      brand: brand.id,
      platform,
      nonce,
    };

    let authorizationUrl: string;
    if (platform === "x") {
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      statePayload.pkce_verifier = verifier;
      const state = signOAuthState(statePayload);
      const url = new URL("https://twitter.com/i/oauth2/authorize");
      url.searchParams.set("response_type", "code");
      url.searchParams.set("client_id", process.env.X_CLIENT_ID!);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set(
        "scope",
        "tweet.read tweet.write users.read offline.access",
      );
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      authorizationUrl = url.toString();
    } else {
      const state = signOAuthState(statePayload);
      authorizationUrl = getSocialProvider(platform).getAuthorizationUrl({
        state,
        redirectUri,
      });
    }

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth start failed";
    return NextResponse.redirect(
      `${siteUrl()}/social?error=${encodeURIComponent(message)}`,
    );
  }
}
