/**
 * Shared Meta OAuth scope constants / helpers.
 * Safe for Client Components — no server-only, no secrets.
 */

/** Facebook Page scopes always requested during Meta OAuth. */
export const META_PAGE_SCOPES = [
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_metadata",
  "business_management",
] as const;

/** Instagram scopes — pass requestIgScopes=true when META_REQUEST_IG_SCOPES is enabled. */
export const META_IG_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
] as const;

export type MetaPageOption = {
  page_id: string;
  page_name: string;
  /** Page access token (may be short; we re-fetch with user token on select). */
  page_access_token?: string;
  ig_user_id: string | null;
  ig_username: string | null;
};

/** OAuth `scope` query value for Facebook / Instagram connect. */
export function getMetaOAuthScopeParam(requestIgScopes: boolean) {
  const scopes: string[] = [...META_PAGE_SCOPES];
  if (requestIgScopes) {
    scopes.push(...META_IG_SCOPES);
  }
  return scopes.join(",");
}

export function getMetaOAuthScopesList(requestIgScopes: boolean) {
  return getMetaOAuthScopeParam(requestIgScopes).split(",").filter(Boolean);
}
