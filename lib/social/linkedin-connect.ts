import "server-only";

import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  exchangeLinkedInCode,
  fetchLinkedInMemberIdentity,
  linkedInMemberMode,
  listLinkedInOrganizations,
} from "@/lib/social/linkedin";
import type { LinkedInOrgOption } from "@/lib/social/linkedin-types";
import { upsertSocialConnection } from "@/lib/social/connections";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TokenSet } from "@/lib/social/types";

export type LinkedInOAuthSession = {
  id: string;
  organization_id: string;
  brand_id: string;
  orgs: LinkedInOrgOption[];
  token_expires_at: string | null;
  expires_at: string;
};

type TokenBundle = {
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
};

export async function createLinkedInOAuthSession(params: {
  organizationId: string;
  brandId: string;
  code: string;
  redirectUri: string;
  createdBy?: string | null;
}): Promise<
  | { kind: "member"; connectionPlatform: "linkedin" }
  | { kind: "org_picker"; session: LinkedInOAuthSession }
> {
  const token = await exchangeLinkedInCode({
    code: params.code,
    redirectUri: params.redirectUri,
  });

  if (linkedInMemberMode()) {
    const member = await fetchLinkedInMemberIdentity(token.accessToken);
    const tokens: TokenSet = {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scopes: token.scopes,
      accountId: member.personUrn,
      accountName: member.name,
      metadata: {
        author_kind: "member",
        linkedin_mode: "member",
      },
    };

    const supabase = createAdminClient();
    await supabase
      .from("social_connections")
      .update({ status: "revoked" })
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("platform", "linkedin")
      .eq("status", "active");

    await upsertSocialConnection({
      organizationId: params.organizationId,
      brandId: params.brandId,
      platform: "linkedin",
      tokens,
    });

    return { kind: "member", connectionPlatform: "linkedin" };
  }

  const orgs = await listLinkedInOrganizations(token.accessToken);
  if (!orgs.length) {
    throw new Error(
      "No LinkedIn company Pages found where you are an approved administrator. Make sure you admin a Page, and that Community Management / organization products are enabled on the LinkedIn app.",
    );
  }

  const bundle: TokenBundle = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    scopes: token.scopes,
  };

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("social_oauth_sessions")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      platform: "linkedin",
      user_access_token_encrypted: encryptSecret(JSON.stringify(bundle)),
      token_expires_at: token.expiresAt?.toISOString() ?? null,
      pages: orgs,
      scopes: token.scopes,
      created_by: params.createdBy ?? null,
    })
    .select(
      "id, organization_id, brand_id, pages, token_expires_at, expires_at",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create LinkedIn OAuth session");
  }

  return {
    kind: "org_picker",
    session: {
      id: data.id,
      organization_id: data.organization_id,
      brand_id: data.brand_id,
      orgs: (data.pages as LinkedInOrgOption[]) ?? orgs,
      token_expires_at: data.token_expires_at,
      expires_at: data.expires_at,
    },
  };
}

export async function getLinkedInOAuthSession(sessionId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("social_oauth_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("platform", "linkedin")
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
    user_access_token_encrypted: string;
    token_expires_at: string | null;
    pages: LinkedInOrgOption[];
    scopes: string[];
    expires_at: string;
  };
}

export async function completeLinkedInOrgSelection(params: {
  sessionId: string;
  orgId: string;
  organizationId: string;
}) {
  const session = await getLinkedInOAuthSession(params.sessionId);
  if (!session) throw new Error("LinkedIn connect session expired — reconnect");
  if (session.organization_id !== params.organizationId) {
    throw new Error("Session does not belong to this organization");
  }

  const org = (session.pages ?? []).find((o) => o.org_id === params.orgId);
  if (!org) throw new Error("Selected company Page is not in this session");

  let accessToken: string;
  let refreshToken: string | null = null;
  let scopes: string[] = session.scopes ?? [];

  try {
    const bundle = JSON.parse(
      decryptSecret(session.user_access_token_encrypted),
    ) as TokenBundle;
    accessToken = bundle.accessToken;
    refreshToken = bundle.refreshToken ?? null;
    if (bundle.scopes?.length) scopes = bundle.scopes;
  } catch {
    accessToken = decryptSecret(session.user_access_token_encrypted);
  }

  const tokens: TokenSet = {
    accessToken,
    refreshToken,
    expiresAt: session.token_expires_at
      ? new Date(session.token_expires_at)
      : null,
    scopes,
    accountId: org.org_urn,
    accountName: org.org_name,
    metadata: {
      organization_id: org.org_id,
      author_kind: "organization",
      linkedin_mode: "organization",
    },
  };

  const supabase = createAdminClient();
  await supabase
    .from("social_connections")
    .update({ status: "revoked" })
    .eq("organization_id", session.organization_id)
    .eq("brand_id", session.brand_id)
    .eq("platform", "linkedin")
    .eq("status", "active");

  const connection = await upsertSocialConnection({
    organizationId: session.organization_id,
    brandId: session.brand_id,
    platform: "linkedin",
    tokens,
  });

  await supabase.from("social_oauth_sessions").delete().eq("id", session.id);
  return connection;
}
