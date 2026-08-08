import { isExpired } from "@/lib/social/types";

export type MetaPublishCapabilities = {
  canPublishFacebook: boolean;
  /** Page Stories (photo_stories) — same core Page publish scopes. */
  canPublishFacebookStories: boolean;
  canPublishInstagram: boolean;
  scopes: string[];
  /** Scopes required for FB Stories that are missing from the connection. */
  missingFacebookStoryScopes: string[];
};

/** Scopes Meta documents for Page photo Stories API. */
export const FACEBOOK_STORY_REQUIRED_SCOPES = [
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_show_list",
] as const;

/** Derive publish capabilities from stored OAuth scopes on a Meta connection. */
export function getMetaPublishCapabilities(params: {
  scopes?: string[] | null;
}): MetaPublishCapabilities {
  const scopes = params.scopes ?? [];
  const has = (s: string) => scopes.includes(s);
  const missingFacebookStoryScopes = FACEBOOK_STORY_REQUIRED_SCOPES.filter(
    (s) => !has(s),
  );
  return {
    scopes,
    canPublishFacebook: has("pages_manage_posts") || has("pages_show_list"),
    canPublishFacebookStories: missingFacebookStoryScopes.length === 0,
    canPublishInstagram: has("instagram_content_publish"),
    missingFacebookStoryScopes: [...missingFacebookStoryScopes],
  };
}

/** True when this connection may publish Facebook Page Stories. */
export function connectionCanPublishFacebookStories(params: {
  scopes?: string[] | null;
}): boolean {
  return getMetaPublishCapabilities({ scopes: params.scopes })
    .canPublishFacebookStories;
}

/** True when this connection may publish to Instagram Graph. */
export function connectionCanPublishInstagram(params: {
  scopes?: string[] | null;
  metadata?: Record<string, unknown> | null;
  platform?: string;
}): boolean {
  const caps = getMetaPublishCapabilities({ scopes: params.scopes });
  if (!caps.canPublishInstagram) return false;
  if (params.platform === "instagram") return true;
  const ig =
    params.metadata && typeof params.metadata.ig_user_id === "string"
      ? params.metadata.ig_user_id
      : null;
  return Boolean(ig);
}

export type MetaInstagramUiStatus =
  | "connected"
  | "not_connected"
  | "needs_reconnect";

export function metaInstagramUiStatus(params: {
  facebook: {
    status: string;
    scopes?: string[] | null;
    metadata?: Record<string, unknown> | null;
    token_expires_at?: string | null;
  } | null;
  instagram?: {
    status: string;
    scopes?: string[] | null;
    token_expires_at?: string | null;
  } | null;
}): MetaInstagramUiStatus {
  const fb = params.facebook;
  if (!fb || (fb.status !== "active" && fb.status !== "expired")) {
    return "not_connected";
  }

  if (fb.status === "expired" || isExpired(fb.token_expires_at)) {
    return "needs_reconnect";
  }

  const caps = getMetaPublishCapabilities({ scopes: fb.scopes });
  const igId =
    fb.metadata && typeof fb.metadata.ig_user_id === "string"
      ? fb.metadata.ig_user_id
      : null;

  if (!caps.canPublishInstagram) {
    // Linked IG on the Page but scopes missing → reconnect to grant IG permissions
    return igId ? "needs_reconnect" : "not_connected";
  }

  if (!igId) return "not_connected";

  const ig = params.instagram;
  if (ig && (ig.status === "expired" || isExpired(ig.token_expires_at))) {
    return "needs_reconnect";
  }

  return "connected";
}

export const INSTAGRAM_SCOPE_REQUIRED_MESSAGE =
  "This Meta connection cannot publish to Instagram (missing Instagram permissions). Reconnect Meta with Instagram scopes enabled (META_REQUEST_IG_SCOPES=true), then try again.";

export const FACEBOOK_STORY_SCOPE_REQUIRED_MESSAGE =
  "This Meta connection cannot publish Facebook Stories (needs pages_manage_posts, pages_read_engagement, and pages_show_list). Reconnect Meta in Social, then try again.";

/**
 * Meta App Review notes for Facebook Page Stories (photo_stories).
 * Not a separate Stories permission — same Page publish scopes as feed photos.
 * Advanced Access is required for customer Pages outside the app's roles.
 */
export const FACEBOOK_STORY_APP_REVIEW_NOTES = {
  endpoint: "POST /{page-id}/photo_stories",
  requiredPermissions: [...FACEBOOK_STORY_REQUIRED_SCOPES],
  alsoRequired:
    "Page access token for a user/system user with CREATE_CONTENT task on the Page",
  appReview:
    "No Stories-specific permission. If pages_manage_posts / pages_read_engagement / pages_show_list already have Advanced Access (needed for multi-tenant Page publishing), Stories work under the same review. Standard Access only covers app admins/developers/testers.",
  businessManagement:
    "business_management is already requested in META_PAGE_SCOPES and is required when using Business system users / Meta Business Suite Pages.",
} as const;
