import { isExpired } from "@/lib/social/types";

export type MetaPublishCapabilities = {
  canPublishFacebook: boolean;
  canPublishInstagram: boolean;
  scopes: string[];
};

/** Derive publish capabilities from stored OAuth scopes on a Meta connection. */
export function getMetaPublishCapabilities(params: {
  scopes?: string[] | null;
}): MetaPublishCapabilities {
  const scopes = params.scopes ?? [];
  const has = (s: string) => scopes.includes(s);
  return {
    scopes,
    canPublishFacebook: has("pages_manage_posts") || has("pages_show_list"),
    canPublishInstagram: has("instagram_content_publish"),
  };
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
