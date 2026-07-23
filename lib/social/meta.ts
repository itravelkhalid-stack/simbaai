import "server-only";

import { readJson, requireEnv } from "@/lib/social/providers/http";
import {
  getMetaOAuthScopeParam as buildMetaOAuthScopeParam,
  getMetaOAuthScopesList as buildMetaOAuthScopesList,
  type MetaPageOption,
} from "@/lib/social/meta-scopes";

export type { MetaPageOption } from "@/lib/social/meta-scopes";
export { META_PAGE_SCOPES, META_IG_SCOPES } from "@/lib/social/meta-scopes";

export function metaRequestIgScopesEnabled() {
  return process.env.META_REQUEST_IG_SCOPES === "true";
}

/** Server helper — reads META_REQUEST_IG_SCOPES from the environment. */
export function getMetaOAuthScopeParam() {
  return buildMetaOAuthScopeParam(metaRequestIgScopesEnabled());
}

export function getMetaOAuthScopesList() {
  return buildMetaOAuthScopesList(metaRequestIgScopesEnabled());
}

export async function exchangeMetaCodeForLongLivedUserToken(params: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  expiresAt: Date | null;
  expiresIn: number | null;
}> {
  const clientId = requireEnv("META_APP_ID");
  const clientSecret = requireEnv("META_APP_SECRET");

  const shortUrl = new URL(
    "https://graph.facebook.com/v21.0/oauth/access_token",
  );
  shortUrl.searchParams.set("client_id", clientId);
  shortUrl.searchParams.set("client_secret", clientSecret);
  shortUrl.searchParams.set("redirect_uri", params.redirectUri);
  shortUrl.searchParams.set("code", params.code);

  const short = (await readJson(await fetch(shortUrl))) as {
    access_token: string;
    expires_in?: number;
  };

  const longUrl = new URL(
    "https://graph.facebook.com/v21.0/oauth/access_token",
  );
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
