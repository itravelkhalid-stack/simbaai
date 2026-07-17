import type { SocialProvider } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

/** YouTube Data API via Google OAuth. */
export const youtubeProvider: SocialProvider = {
  id: "youtube",
  displayName: "YouTube",

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/yt-analytics.readonly",
      ].join(" "),
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const token = (await readJson(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    const channels = (await readJson(
      await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      ),
    )) as {
      items?: Array<{ id: string; snippet?: { title?: string } }>;
    };
    const channel = channels.items?.[0];
    if (!channel) throw new Error("No YouTube channel found for this Google account");

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(" ") ?? [],
      accountId: channel.id,
      accountName: channel.snippet?.title || "YouTube channel",
    };
  },

  async refreshToken({ refreshToken }) {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    });
    const token = (await readJson(
      await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
    )) as {
      access_token: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: token.access_token,
      refreshToken,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(" ") ?? [],
      accountId: "",
      accountName: "",
    };
  },

  async publishPost(input) {
    // Full resumable upload is multi-step; for scheduled shorts we expect a hosted video URL
    // and use the videos.insert metadata path after a prior media upload pipeline.
    if (!input.mediaUrls[0]) {
      throw new Error(
        "YouTube publishing requires a video media URL (resumable upload pipeline)",
      );
    }
    throw new Error(
      "YouTube direct URL publish is not supported by the Data API — configure the media upload worker or attach a previously uploaded video ID in metadata.youtube_video_id",
    );
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "statistics");
    url.searchParams.set("id", platformPostId);
    const json = (await readJson(
      await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    )) as {
      items?: Array<{
        statistics?: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
    };
    const stats = json.items?.[0]?.statistics ?? {};
    return {
      impressions: Number(stats.viewCount ?? 0),
      reach: Number(stats.viewCount ?? 0),
      likes: Number(stats.likeCount ?? 0),
      comments: Number(stats.commentCount ?? 0),
      shares: 0,
      saves: 0,
      clicks: 0,
      raw: json,
    };
  },
};
