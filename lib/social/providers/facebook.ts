import type { SocialProvider, TokenSet } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

/**
 * Meta Graph API — Facebook Pages.
 * Instagram Business publishing uses the same app; see `instagramProvider`.
 */
export const facebookProvider: SocialProvider = {
  id: "facebook",
  displayName: "Facebook Page",
  covers: ["facebook"],

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("META_APP_ID");
    const scopes = [
      "pages_show_list",
      "pages_manage_posts",
      "pages_read_engagement",
      "business_management",
    ].join(",");
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes);
    url.searchParams.set("response_type", "code");
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const clientId = requireEnv("META_APP_ID");
    const clientSecret = requireEnv("META_APP_SECRET");
    const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", clientId);
    tokenUrl.searchParams.set("client_secret", clientSecret);
    tokenUrl.searchParams.set("redirect_uri", redirectUri);
    tokenUrl.searchParams.set("code", code);

    const short = (await readJson(await fetch(tokenUrl))) as {
      access_token: string;
      expires_in?: number;
    };

    const longUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", clientId);
    longUrl.searchParams.set("client_secret", clientSecret);
    longUrl.searchParams.set("fb_exchange_token", short.access_token);
    const longLived = (await readJson(await fetch(longUrl))) as {
      access_token: string;
      expires_in?: number;
    };

    const pages = (await readJson(
      await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${longLived.access_token}`,
      ),
    )) as { data?: Array<{ id: string; name: string; access_token: string }> };

    const page = pages.data?.[0];
    if (!page) throw new Error("No Facebook Pages found for this user");

    return {
      accessToken: page.access_token,
      refreshToken: null,
      expiresAt: longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000)
        : null,
      scopes: ["pages_manage_posts", "pages_read_engagement"],
      accountId: page.id,
      accountName: page.name,
      metadata: { user_access_token: longLived.access_token },
    } satisfies TokenSet;
  },

  async refreshToken() {
    throw new Error(
      "Facebook Page tokens are long-lived; reconnect via OAuth when expired",
    );
  },

  async publishPost(input) {
    const message = [input.copy, input.hashtags.map((h) => `#${h}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    if (input.mediaUrls[0]) {
      const body = new URLSearchParams({
        url: input.mediaUrls[0],
        caption: message,
        access_token: input.accessToken,
      });
      const json = (await readJson(
        await fetch(`https://graph.facebook.com/v21.0/${input.accountId}/photos`, {
          method: "POST",
          body,
        }),
      )) as { id?: string; post_id?: string };
      return { platformPostId: json.post_id || json.id || "" };
    }

    const body = new URLSearchParams({
      message,
      access_token: input.accessToken,
    });
    const json = (await readJson(
      await fetch(`https://graph.facebook.com/v21.0/${input.accountId}/feed`, {
        method: "POST",
        body,
      }),
    )) as { id: string };
    return { platformPostId: json.id };
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const url = new URL(`https://graph.facebook.com/v21.0/${platformPostId}`);
    url.searchParams.set(
      "fields",
      "insights.metric(post_impressions,post_impressions_unique,post_clicks,post_reactions_by_type_total)",
    );
    url.searchParams.set("access_token", accessToken);
    const json = (await readJson(await fetch(url))) as {
      insights?: { data?: Array<{ name: string; values?: Array<{ value: number }> }> };
    };
    const map = new Map(
      (json.insights?.data ?? []).map((row) => [row.name, row.values?.[0]?.value ?? 0]),
    );
    return {
      impressions: map.get("post_impressions") ?? 0,
      reach: map.get("post_impressions_unique") ?? 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      clicks: map.get("post_clicks") ?? 0,
      raw: json,
    };
  },
};
