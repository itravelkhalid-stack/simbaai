import type { SocialProvider } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

/** TikTok Content Posting API (OAuth 2). */
export const tiktokProvider: SocialProvider = {
  id: "tiktok",
  displayName: "TikTok",

  getAuthorizationUrl({ state, redirectUri }) {
    const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
    const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
    url.searchParams.set("client_key", clientKey);
    url.searchParams.set("scope", "user.info.basic,video.publish,video.upload");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
    const clientSecret = requireEnv("TIKTOK_CLIENT_SECRET");
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const token = (await readJson(
      await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      open_id?: string;
    };

    const user = (await readJson(
      await fetch(
        "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username",
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      ),
    )) as {
      data?: {
        user?: { open_id?: string; display_name?: string; username?: string };
      };
    };

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(",") ?? [],
      accountId: user.data?.user?.open_id || token.open_id || "",
      accountName:
        user.data?.user?.display_name ||
        user.data?.user?.username ||
        "TikTok account",
    };
  },

  async refreshToken({ refreshToken }) {
    const clientKey = requireEnv("TIKTOK_CLIENT_KEY");
    const clientSecret = requireEnv("TIKTOK_CLIENT_SECRET");
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const token = (await readJson(
      await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      open_id?: string;
    };
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(",") ?? [],
      accountId: token.open_id || "",
      accountName: "",
    };
  },

  async publishPost(input) {
    if (!input.mediaUrls[0]) {
      throw new Error("TikTok publishing requires a public video URL");
    }
    const caption = [input.copy, input.hashtags.map((h) => `#${h}`).join(" ")]
      .filter(Boolean)
      .join(" ");

    // Inbox/direct post flow — initiate upload then publish.
    const init = (await readJson(
      await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source_info: {
            source: "PULL_FROM_URL",
            video_url: input.mediaUrls[0],
          },
        }),
      }),
    )) as { data?: { publish_id?: string } };

    const publishId = init.data?.publish_id;
    if (!publishId) throw new Error("TikTok did not return a publish_id");

    // Caption is applied via creator inbox for PULL_FROM_URL in many app modes.
    void caption;
    return { platformPostId: publishId };
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const json = (await readJson(
      await fetch("https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filters: { video_ids: [platformPostId] } }),
      }),
    )) as {
      data?: {
        videos?: Array<{
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          share_count?: number;
        }>;
      };
    };
    const video = json.data?.videos?.[0] ?? {};
    return {
      impressions: video.view_count ?? 0,
      reach: video.view_count ?? 0,
      likes: video.like_count ?? 0,
      comments: video.comment_count ?? 0,
      shares: video.share_count ?? 0,
      saves: 0,
      clicks: 0,
      raw: json,
    };
  },
};
