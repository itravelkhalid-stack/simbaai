import type { SocialProvider, TokenSet } from "@/lib/social/types";
import { getMetaOAuthScopeParam } from "@/lib/social/meta-scopes";
import { readJson, requireEnv } from "@/lib/social/providers/http";

/**
 * Meta Graph API — Facebook Pages.
 * OAuth code exchange + page selection is handled in the Meta connect flow
 * (`lib/social/meta.ts` + `/social/meta/select`). This provider only publishes/metrics.
 */
export const facebookProvider: SocialProvider = {
  id: "facebook",
  displayName: "Facebook Page",
  covers: ["facebook"],

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("META_APP_ID");
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set(
      "scope",
      getMetaOAuthScopeParam(process.env.META_REQUEST_IG_SCOPES === "true"),
    );
    url.searchParams.set("response_type", "code");
    return url.toString();
  },

  async exchangeCode() {
    throw new Error(
      "Facebook connect uses the Meta page picker flow — do not call exchangeCode directly",
    );
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
      insights?: {
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
      };
    };
    const map = new Map(
      (json.insights?.data ?? []).map((row) => [
        row.name,
        row.values?.[0]?.value ?? 0,
      ]),
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

/** @deprecated Token assembly happens in meta select flow */
export type FacebookTokenSet = TokenSet;
