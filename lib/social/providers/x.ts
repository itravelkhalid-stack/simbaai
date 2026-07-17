import { createHash, createHmac, randomBytes } from "crypto";

import type { SocialProvider } from "@/lib/social/types";
import { readJson, requireEnv } from "@/lib/social/providers/http";

function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** X API v2 OAuth 2.0 with PKCE. */
export const xProvider: SocialProvider = {
  id: "x",
  displayName: "X (Twitter)",

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = requireEnv("X_CLIENT_ID");
    const { verifier, challenge } = pkce();
    // Embed verifier in state metadata via env cache is awkward; store in state JSON upstream.
    // Caller should pass state that already includes pkce_verifier when using X.
    const url = new URL("https://twitter.com/i/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    // Attach challenge mapping hint for callback via custom header not possible;
    // we recompute from verifier stored in signed state (see oauth start route).
    void verifier;
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }) {
    const clientId = requireEnv("X_CLIENT_ID");
    const clientSecret = process.env.X_CLIENT_SECRET;
    // pkce_verifier must be supplied via redirectUri query hack — handled in callback wrapper
    const verifier = (globalThis as { __xPkceVerifier?: string }).__xPkceVerifier;
    if (!verifier) {
      throw new Error("Missing PKCE verifier for X OAuth exchange");
    }

    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });

    const headers: HeadersInit = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    }

    const token = (await readJson(
      await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers,
        body,
      }),
    )) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    const me = (await readJson(
      await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      }),
    )) as { data: { id: string; name: string; username: string } };

    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? null,
      expiresAt: token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000)
        : null,
      scopes: token.scope?.split(" ") ?? [],
      accountId: me.data.id,
      accountName: `@${me.data.username}`,
    };
  },

  async refreshToken({ refreshToken }) {
    const clientId = requireEnv("X_CLIENT_ID");
    const clientSecret = process.env.X_CLIENT_SECRET;
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      client_id: clientId,
    });
    const headers: HeadersInit = {
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    }
    const token = (await readJson(
      await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers,
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
      scopes: token.scope?.split(" ") ?? [],
      accountId: "",
      accountName: "",
    };
  },

  async publishPost(input) {
    const text = [input.copy, input.hashtags.map((h) => `#${h}`).join(" ")]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 280);

    const json = (await readJson(
      await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      }),
    )) as { data: { id: string } };

    return { platformPostId: json.data.id };
  },

  async getPostMetrics({ accessToken, platformPostId }) {
    const url = new URL(`https://api.twitter.com/2/tweets/${platformPostId}`);
    url.searchParams.set("tweet.fields", "public_metrics");
    const json = (await readJson(
      await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    )) as {
      data?: {
        public_metrics?: {
          impression_count?: number;
          like_count?: number;
          reply_count?: number;
          retweet_count?: number;
          bookmark_count?: number;
        };
      };
    };
    const m = json.data?.public_metrics ?? {};
    return {
      impressions: m.impression_count ?? 0,
      reach: m.impression_count ?? 0,
      likes: m.like_count ?? 0,
      comments: m.reply_count ?? 0,
      shares: m.retweet_count ?? 0,
      saves: m.bookmark_count ?? 0,
      clicks: 0,
      raw: json,
    };
  },
};

export function buildXAuthorizationUrl(input: {
  state: string;
  redirectUri: string;
  codeChallenge: string;
}) {
  const clientId = requireEnv("X_CLIENT_ID");
  const url = new URL("https://twitter.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function createXPkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** HMAC helper retained for future signed request needs. */
export function signXRequest(base: string, key: string) {
  return createHmac("sha1", key).update(base).digest("base64");
}
