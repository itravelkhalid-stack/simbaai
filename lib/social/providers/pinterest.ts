import type { SocialProvider } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

export const pinterestProvider: SocialProvider = {
  id: "pinterest",
  displayName: "Pinterest",

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("PINTEREST_APP_ID");
    const url = new URL("https://www.pinterest.com/oauth/");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "boards:read,pins:read,pins:write,user_accounts:read");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const clientId = requireEnv("PINTEREST_APP_ID");
    const clientSecret = requireEnv("PINTEREST_APP_SECRET");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const token = (await readJson(
      await fetch("https://api.pinterest.com/v5/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }),
    )) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    const account = (await readJson(
      await fetch("https://api.pinterest.com/v5/user_account", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
    )) as { username?: string; id?: string; business_name?: string };

    const boards = (await readJson(
      await fetch("https://api.pinterest.com/v5/boards?page_size=1", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
    )) as { items?: Array<{ id: string; name: string }> };

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(",") ?? [],
      accountId: account.username || account.id || "pinterest",
      accountName: account.business_name || account.username || "Pinterest",
      metadata: { default_board_id: boards.items?.[0]?.id },
    };
  },

  async refreshToken({ refreshToken }) {
    const clientId = requireEnv("PINTEREST_APP_ID");
    const clientSecret = requireEnv("PINTEREST_APP_SECRET");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const token = (await readJson(
      await fetch("https://api.pinterest.com/v5/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }),
    )) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? refreshToken,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(",") ?? [],
      accountId: "",
      accountName: "",
    };
  },

  async publishPost(input) {
    const boardId = String(input.metadata.default_board_id ?? "");
    if (!boardId) throw new Error("Pinterest connection is missing a default board");
    if (!input.mediaUrls[0]) throw new Error("Pinterest pins require an image URL");

    const json = (await readJson(
      await fetch("https://api.pinterest.com/v5/pins", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          board_id: boardId,
          title: input.copy.slice(0, 100),
          description: [
            input.copy,
            input.hashtags.map((h) => `#${h}`).join(" "),
          ]
            .filter(Boolean)
            .join("\n\n"),
          media_source: {
            source_type: "image_url",
            url: input.mediaUrls[0],
          },
        }),
      }),
    )) as { id: string };

    return { platformPostId: json.id };
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const json = (await readJson(
      await fetch(
        `https://api.pinterest.com/v5/pins/${platformPostId}/analytics?metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    )) as Record<string, { summary_metrics?: Record<string, number> }>;

    const summary = Object.values(json)[0]?.summary_metrics ?? {};
    return {
      impressions: summary.IMPRESSION ?? 0,
      reach: summary.IMPRESSION ?? 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: summary.SAVE ?? 0,
      clicks: (summary.PIN_CLICK ?? 0) + (summary.OUTBOUND_CLICK ?? 0),
      raw: json,
    };
  },
};
