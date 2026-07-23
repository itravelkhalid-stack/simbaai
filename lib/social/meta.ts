import "server-only";

import { readJson, requireEnv } from "@/lib/social/providers/http";

/** Facebook Page scopes always requested during Meta OAuth. */
export const META_PAGE_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_metadata",
  "business_management",
] as const;

/** Instagram scopes — only when META_REQUEST_IG_SCOPES=true. */
export const META_IG_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
] as const;

export function metaRequestIgScopesEnabled() {
  return process.env.META_REQUEST_IG_SCOPES === "true";
}

/** OAuth `scope` query value for Facebook / Instagram connect. */
export function getMetaOAuthScopeParam() {
  const scopes: string[] = [...META_PAGE_SCOPES];
  if (metaRequestIgScopesEnabled()) {
    scopes.push(...META_IG_SCOPES);
  }
  return scopes.join(",");
}

export function getMetaOAuthScopesList() {
  return getMetaOAuthScopeParam().split(",").filter(Boolean);
}

export type MetaPageOption = {
  page_id: string;
  page_name: string;
  /** Page access token (may be short; we re-fetch with user token on select). */
  page_access_token?: string;
  ig_user_id: string | null;
  ig_username: string | null;
};

export async function exchangeMetaCodeForLongLivedUserToken(params: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; expiresAt: Date | null; expiresIn: number | null }> {
  const clientId = requireEnv("META_APP_ID");
  const clientSecret = requireEnv("META_APP_SECRET");

  const shortUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  shortUrl.searchParams.set("client_id", clientId);
  shortUrl.searchParams.set("client_secret", clientSecret);
  shortUrl.searchParams.set("redirect_uri", params.redirectUri);
  shortUrl.searchParams.set("code", params.code);

  const short = (await readJson(await fetch(shortUrl))) as {
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

  const expiresIn = longLived.expires_in ?? short.expires_in ?? null;
  return {
    accessToken: longLived.access_token,
    expiresIn,
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null,
  };
}

export async function listMetaPages(
  userAccessToken: string,
): Promise<MetaPageOption[]> {
  const url = new URL("https://graph.facebook.com/v21.0/me/accounts");
  url.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}",
  );
  url.searchParams.set("access_token", userAccessToken);
  url.searchParams.set("limit", "100");

  const json = (await readJson(await fetch(url))) as {
    data?: Array<{
      id: string;
      name: string;
      access_token?: string;
      instagram_business_account?: { id: string; username?: string };
    }>;
  };

  return (json.data ?? []).map((page) => ({
    page_id: page.id,
    page_name: page.name,
    page_access_token: page.access_token,
    ig_user_id: page.instagram_business_account?.id ?? null,
    ig_username: page.instagram_business_account?.username ?? null,
  }));
}

/** Page token from a long-lived user token — typically long-lived / durable. */
export async function fetchPageAccessToken(params: {
  userAccessToken: string;
  pageId: string;
}): Promise<{ accessToken: string; pageName: string }> {
  const url = new URL(`https://graph.facebook.com/v21.0/${params.pageId}`);
  url.searchParams.set("fields", "id,name,access_token");
  url.searchParams.set("access_token", params.userAccessToken);

  const json = (await readJson(await fetch(url))) as {
    id: string;
    name: string;
    access_token?: string;
  };

  if (!json.access_token) {
    throw new Error("Could not fetch Page access token for the selected Page");
  }

  return { accessToken: json.access_token, pageName: json.name };
}

export function isMetaTokenError(message: string) {
  return /token|oauth|expired|unauthorized|session.*(expired|invalid)|190|102|463|467|error.?code.?190/i.test(
    message,
  );
}
