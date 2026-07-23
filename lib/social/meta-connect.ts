import "server-only";

import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  exchangeMetaCodeForLongLivedUserToken,
  fetchPageAccessToken,
  getMetaOAuthScopesList,
  listMetaPages,
  metaRequestIgScopesEnabled,
  type MetaPageOption,
} from "@/lib/social/meta";
import { upsertSocialConnection } from "@/lib/social/connections";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentPlatform } from "@/lib/types/content";
import type { TokenSet } from "@/lib/social/types";

export type MetaOAuthSession = {
  id: string;
  organization_id: string;
  brand_id: string;
  platform: "facebook" | "instagram";
  pages: MetaPageOption[];
  token_expires_at: string | null;
  expires_at: string;
};

export async function createMetaOAuthSession(params: {
  organizationId: string;
  brandId: string;
  platform: "facebook" | "instagram";
  code: string;
  redirectUri: string;
  createdBy?: string | null;
}): Promise<MetaOAuthSession> {
  const longLived = await exchangeMetaCodeForLongLivedUserToken({
    code: params.code,
    redirectUri: params.redirectUri,
  });
  const pages = await listMetaPages(longLived.accessToken);

  if (!pages.length) {
    throw new Error("No Facebook Pages found for this Meta account");
  }

  if (params.platform === "instagram") {
    const withIg = pages.filter((p) => p.ig_user_id);
    if (!withIg.length) {
      throw new Error(
        "No Instagram Business accounts linked to your Facebook Pages",
      );
    }
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("social_oauth_sessions")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      platform: params.platform,
      user_access_token_encrypted: encryptSecret(longLived.accessToken),
      token_expires_at: longLived.expiresAt?.toISOString() ?? null,
      pages,
      scopes: [],
      created_by: params.createdBy ?? null,
    })
    .select("id, organization_id, brand_id, platform, pages, token_expires_at, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create Meta OAuth session");
  }

  return {
    id: data.id,
    organization_id: data.organization_id,
    brand_id: data.brand_id,
    platform: data.platform as "facebook" | "instagram",
    pages: (data.pages as MetaPageOption[]) ?? pages,
    token_expires_at: data.token_expires_at,
    expires_at: data.expires_at,
  };
}

export async function getMetaOAuthSession(sessionId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("social_oauth_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("social_oauth_sessions").delete().eq("id", sessionId);
    return null;
  }
  return data as {
    id: string;
    organization_id: string;
    brand_id: string;
    platform: "facebook" | "instagram";
    user_access_token_encrypted: string;
    token_expires_at: string | null;
    pages: MetaPageOption[];
    expires_at: string;
  };
}

export async function completeMetaPageSelection(params: {
  sessionId: string;
  pageId: string;
  organizationId: string;
}) {
  const session = await getMetaOAuthSession(params.sessionId);
  if (!session) throw new Error("Meta connect session expired — reconnect");
  if (session.organization_id !== params.organizationId) {
    throw new Error("Session does not belong to this organization");
  }

  const page = (session.pages ?? []).find((p) => p.page_id === params.pageId);
  if (!page) throw new Error("Selected Page is not in this session");

  if (session.platform === "instagram" && !metaRequestIgScopesEnabled()) {
    throw new Error(
      "Instagram connect requires META_REQUEST_IG_SCOPES=true once those permissions are approved on the Meta app",
    );
  }

  if (session.platform === "instagram" && !page.ig_user_id) {
    throw new Error("That Page has no linked Instagram Business account");
  }

  const userToken = decryptSecret(session.user_access_token_encrypted);
  const pageToken = await fetchPageAccessToken({
    userAccessToken: userToken,
    pageId: page.page_id,
  });

  const tokens: TokenSet = {
    accessToken: pageToken.accessToken,
    refreshToken: null,
    // Page tokens from long-lived user tokens are durable; track user-token window for reconnect UX
    expiresAt: session.token_expires_at
      ? new Date(session.token_expires_at)
      : null,
    scopes: getMetaOAuthScopesList(),
    accountId:
      session.platform === "instagram"
        ? (page.ig_user_id as string)
        : page.page_id,
    accountName:
      session.platform === "instagram"
        ? page.ig_username || `${page.page_name} Instagram`
        : pageToken.pageName || page.page_name,
    metadata: {
      page_id: page.page_id,
      page_name: page.page_name,
      ig_user_id: page.ig_user_id,
      ig_username: page.ig_username,
      user_access_token_encrypted: encryptSecret(userToken),
      meta_token_kind: "page",
    },
  };

  const supabase = createAdminClient();
  // Revoke prior active connections for this org/brand/platform (page switch)
  await supabase
    .from("social_connections")
    .update({ status: "revoked" })
    .eq("organization_id", session.organization_id)
    .eq("brand_id", session.brand_id)
    .eq("platform", session.platform)
    .eq("status", "active");

  const connection = await upsertSocialConnection({
    organizationId: session.organization_id,
    brandId: session.brand_id,
    platform: session.platform as ContentPlatform,
    tokens,
  });

  await supabase.from("social_oauth_sessions").delete().eq("id", session.id);

  return connection;
}
