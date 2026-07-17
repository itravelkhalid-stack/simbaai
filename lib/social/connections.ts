import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { getSocialProvider } from "@/lib/social/providers";
import type { SocialConnection, TokenSet } from "@/lib/social/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentPlatform } from "@/lib/types/content";

export function encryptTokenSet(tokens: TokenSet) {
  return {
    access_token_encrypted: encryptSecret(tokens.accessToken),
    refresh_token_encrypted: tokens.refreshToken
      ? encryptSecret(tokens.refreshToken)
      : null,
    token_expires_at: tokens.expiresAt?.toISOString() ?? null,
    scopes: tokens.scopes ?? [],
    account_id: tokens.accountId,
    account_name: tokens.accountName,
    metadata: tokens.metadata ?? {},
  };
}

export function decryptConnection(connection: SocialConnection) {
  return {
    accessToken: decryptSecret(connection.access_token_encrypted),
    refreshToken: connection.refresh_token_encrypted
      ? decryptSecret(connection.refresh_token_encrypted)
      : null,
  };
}

export async function upsertSocialConnection(params: {
  organizationId: string;
  brandId: string;
  platform: ContentPlatform;
  tokens: TokenSet;
}) {
  const supabase = createAdminClient();
  const encrypted = encryptTokenSet(params.tokens);

  const { data, error } = await supabase
    .from("social_connections")
    .upsert(
      {
        organization_id: params.organizationId,
        brand_id: params.brandId,
        platform: params.platform,
        account_name: encrypted.account_name,
        account_id: encrypted.account_id,
        access_token_encrypted: encrypted.access_token_encrypted,
        refresh_token_encrypted: encrypted.refresh_token_encrypted,
        token_expires_at: encrypted.token_expires_at,
        scopes: encrypted.scopes,
        status: "active",
        metadata: encrypted.metadata,
        last_error: null,
      },
      { onConflict: "organization_id,platform,account_id" },
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as SocialConnection;
}

export async function getActiveConnection(params: {
  organizationId: string;
  brandId: string;
  platform: ContentPlatform;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("social_connections")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("platform", params.platform)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as SocialConnection | null;
}

export async function ensureFreshAccessToken(connection: SocialConnection) {
  const expiresAt = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : null;
  const needsRefresh =
    expiresAt != null && expiresAt - Date.now() < 5 * 60 * 1000;

  const decrypted = decryptConnection(connection);
  if (!needsRefresh) {
    return { connection, accessToken: decrypted.accessToken };
  }

  if (!decrypted.refreshToken) {
    const supabase = createAdminClient();
    await supabase
      .from("social_connections")
      .update({
        status: "expired",
        last_error: "Access token expired and no refresh token is available",
      })
      .eq("id", connection.id);
    throw new Error(
      `${connection.platform} token expired — reconnect in Settings → Connections`,
    );
  }

  const provider = getSocialProvider(connection.platform);
  const refreshed = await provider.refreshToken({
    refreshToken: decrypted.refreshToken,
    accessToken: decrypted.accessToken,
    metadata: connection.metadata,
  });

  const supabase = createAdminClient();
  const encrypted = encryptTokenSet({
    ...refreshed,
    accountId: refreshed.accountId || connection.account_id,
    accountName: refreshed.accountName || connection.account_name,
    metadata: { ...connection.metadata, ...(refreshed.metadata ?? {}) },
  });

  const { data, error } = await supabase
    .from("social_connections")
    .update({
      access_token_encrypted: encrypted.access_token_encrypted,
      refresh_token_encrypted:
        encrypted.refresh_token_encrypted ?? connection.refresh_token_encrypted,
      token_expires_at: encrypted.token_expires_at,
      scopes: encrypted.scopes.length ? encrypted.scopes : connection.scopes,
      status: "active",
      last_error: null,
      metadata: encrypted.metadata,
    })
    .eq("id", connection.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return {
    connection: data as SocialConnection,
    accessToken: refreshed.accessToken,
  };
}
