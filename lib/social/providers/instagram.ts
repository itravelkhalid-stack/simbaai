import type { SocialProvider } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

/**
 * Instagram Business via Meta Graph.
 * Connect + page/IG selection is handled by the Meta page picker flow.
 */
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
      "pages_manage_metadata",
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

  async exchangeCode() {
    throw new Error(
      "Instagram connect uses the Meta page picker flow — do not call exchangeCode directly",
    );
  },

  async refreshToken() {
    throw new Error("Reconnect Instagram via OAuth when the token expires");
  },

  async publishPost(input) {
    const caption = [input.copy, input.hashtags.map((h) => `#${h}`).join(" ")]
      .filter(Boolean)
      .join("\n\n");

    if (!input.mediaUrls[0]) {
      throw new Error(
        "Instagram publishing requires at least one publicly reachable image URL",
      );
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
      await fetch(
        `https://graph.facebook.com/v21.0/${input.accountId}/media_publish`,
        {
          method: "POST",
          body: publishBody,
        },
      ),
    )) as { id: string };

    return { platformPostId: published.id };
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const url = new URL(
      `https://graph.facebook.com/v21.0/${platformPostId}/insights`,
    );
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
