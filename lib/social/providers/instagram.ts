import type { SocialProvider } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

/** Instagram Business publishing via Meta Graph API (requires FB Page linked IG). */
export const instagramProvider: SocialProvider = {
  id: "instagram",
  displayName: "Instagram Business",
  covers: ["instagram"],

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("META_APP_ID");
    const scopes = [
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "pages_show_list",
      "pages_read_engagement",
      "business_management",
    ].join(",");
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes);
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
    const token = (await readJson(await fetch(tokenUrl))) as {
      access_token: string;
      expires_in?: number;
    };

    const pages = (await readJson(
      await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${token.access_token}`,
      ),
    )) as {
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string; username?: string };
      }>;
    };

    const page = pages.data?.find((p) => p.instagram_business_account?.id);
    if (!page?.instagram_business_account) {
      throw new Error("No Instagram Business account linked to a Facebook Page");
    }

    return {
      accessToken: page.access_token,
      refreshToken: null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: ["instagram_content_publish", "instagram_manage_insights"],
      accountId: page.instagram_business_account.id,
      accountName:
        page.instagram_business_account.username ||
        `${page.name} Instagram`,
      metadata: { page_id: page.id },
    };
  },

  async refreshToken() {
    throw new Error("Reconnect Instagram via OAuth when the token expires");
  },

  async publishPost(input) {
    const caption = [input.copy, input.hashtags.map((h) => `#${h}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    if (!input.mediaUrls[0]) {
      throw new Error("Instagram publishing requires at least one public media URL");
    }

    const createBody = new URLSearchParams({
      image_url: input.mediaUrls[0],
      caption,
      access_token: input.accessToken,
    });
    const created = (await readJson(
      await fetch(`https://graph.facebook.com/v21.0/${input.accountId}/media`, {
        method: "POST",
        body: createBody,
      }),
    )) as { id: string };

    const publishBody = new URLSearchParams({
      creation_id: created.id,
      access_token: input.accessToken,
    });
    const published = (await readJson(
      await fetch(`https://graph.facebook.com/v21.0/${input.accountId}/media_publish`, {
        method: "POST",
        body: publishBody,
      }),
    )) as { id: string };

    return { platformPostId: published.id };
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const url = new URL(`https://graph.facebook.com/v21.0/${platformPostId}/insights`);
    url.searchParams.set(
      "metric",
      "impressions,reach,likes,comments,shares,saved",
    );
    url.searchParams.set("access_token", accessToken);
    const json = (await readJson(await fetch(url))) as {
      data?: Array<{ name: string; values?: Array<{ value: number }> }>;
    };
    const map = new Map(
      (json.data ?? []).map((row) => [row.name, row.values?.[0]?.value ?? 0]),
    );
    return {
      impressions: map.get("impressions") ?? 0,
      reach: map.get("reach") ?? 0,
      likes: map.get("likes") ?? 0,
      comments: map.get("comments") ?? 0,
      shares: map.get("shares") ?? 0,
      saves: map.get("saved") ?? 0,
      clicks: 0,
      raw: json,
    };
  },
};
