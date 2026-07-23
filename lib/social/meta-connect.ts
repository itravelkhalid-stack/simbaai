import "server-only";

import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  exchangeMetaCodeForLongLivedUserToken,
  fetchPageAccessToken,
  getMetaOAuthScopesList,
  listMetaPages,
  type MetaPageOption,
} from "@/lib/social/meta";
import {
  connectionCanPublishInstagram,
  getMetaPublishCapabilities,
} from "@/lib/social/meta-capabilities";
import { upsertSocialConnection } from "@/lib/social/connections";
import { createAdminClient } from "@/lib/supabase/admin";
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
  /** Always stored as facebook — Instagram is derived from the same Meta token. */
  platform?: "facebook" | "instagram";
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

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("social_oauth_sessions")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      platform: "facebook",
      user_access_token_encrypted: encryptSecret(longLived.accessToken),
      token_expires_at: longLived.expiresAt?.toISOString() ?? null,
      pages,
      scopes: getMetaOAuthScopesList(),
      created_by: params.createdBy ?? null,
    })
    .select(
      "id, organization_id, brand_id, platform, pages, token_expires_at, expires_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create Meta OAuth session");
  }

  return {
    id: data.id,
    organization_id: data.organization_id,
    brand_id: data.brand_id,
    platform: "facebook",
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

  const userToken = decryptSecret(session.user_access_token_encrypted);
  const pageToken = await fetchPageAccessToken({
    userAccessToken: userToken,
    pageId: page.page_id,
  });

  const scopes = getMetaOAuthScopesList();
  const caps = getMetaPublishCapabilities({ scopes });
  const sharedMeta: Record<string, unknown> = {
    page_id: page.page_id,
    page_name: page.page_name,
    ig_user_id: page.ig_user_id,
    ig_username: page.ig_username,
    user_access_token_encrypted: encryptSecret(userToken),
    meta_token_kind: "page",
    capabilities: caps,
  };

  const facebookTokens: TokenSet = {
    accessToken: pageToken.accessToken,
    refreshToken: null,
    expiresAt: session.token_expires_at
      ? new Date(session.token_expires_at)
      : null,
    scopes,
    accountId: page.page_id,
    accountName: pageToken.pageName || page.page_name,
    metadata: sharedMeta,
  };

  const supabase = createAdminClient();

  await supabase
    .from("social_connections")
    .update({ status: "revoked" })
    .eq("organization_id", session.organization_id)
    .eq("brand_id", session.brand_id)
    .eq("platform", "facebook")
    .eq("status", "active");

  const facebook = await upsertSocialConnection({
    organizationId: session.organization_id,
    brandId: session.brand_id,
    platform: "facebook",
    tokens: facebookTokens,
  });

  const canIg = connectionCanPublishInstagram({
    scopes,
    metadata: sharedMeta,
    platform: "facebook",
  });

  if (canIg && page.ig_user_id) {
    await supabase
      .from("social_connections")
      .update({ status: "revoked" })
      .eq("organization_id", session.organization_id)
      .eq("brand_id", session.brand_id)
      .eq("platform", "instagram")
      .eq("status", "active");

    await upsertSocialConnection({
      organizationId: session.organization_id,
      brandId: session.brand_id,
      platform: "instagram",
      tokens: {
        accessToken: pageToken.accessToken,
        refreshToken: null,
        expiresAt: session.token_expires_at
          ? new Date(session.token_expires_at)
          : null,
        scopes,
        accountId: page.ig_user_id,
        accountName: page.ig_username || `${page.page_name} Instagram`,
        metadata: sharedMeta,
      },
    });
  } else {
    // No IG publish capability — clear any prior Instagram connection for this brand
    await supabase
      .from("social_connections")
      .update({
        status: "revoked",
        last_error:
          "Instagram publishing unavailable on this Meta token (missing IG scopes or no linked IG account).",
      })
      .eq("organization_id", session.organization_id)
      .eq("brand_id", session.brand_id)
      .eq("platform", "instagram")
      .neq("status", "revoked");
  }

  await supabase.from("social_oauth_sessions").delete().eq("id", session.id);

  return facebook;
}
