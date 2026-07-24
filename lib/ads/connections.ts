import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { getAdsProvider } from "@/lib/ads/providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { AdConnection, AdPlatform } from "@/lib/types/ads";
import type { AdsTokenSet } from "@/lib/ads/providers/types";

export async function upsertAdConnection(params: {
  organizationId: string;
  brandId: string;
  platform: AdPlatform;
  tokens: AdsTokenSet;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ad_connections")
    .upsert(
      {
        organization_id: params.organizationId,
        brand_id: params.brandId,
        platform: params.platform,
        account_id: params.tokens.accountId,
        account_name: params.tokens.accountName,
        access_token_encrypted: encryptSecret(params.tokens.accessToken),
        refresh_token_encrypted: params.tokens.refreshToken
          ? encryptSecret(params.tokens.refreshToken)
          : null,
        token_expires_at: params.tokens.expiresAt?.toISOString() ?? null,
        scopes: params.tokens.scopes ?? [],
        status: "active",
        metadata: params.tokens.metadata ?? {},
        last_error: null,
      },
      { onConflict: "organization_id,platform,account_id" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as AdConnection;
}

export function decryptAdConnection(connection: AdConnection) {
  return {
    accessToken: decryptSecret(connection.access_token_encrypted),
    refreshToken: connection.refresh_token_encrypted
      ? decryptSecret(connection.refresh_token_encrypted)
      : null,
  };
}

/** Refresh OAuth access token when expired (or within 60s of expiry). */
export async function ensureFreshAdAccessToken(connection: AdConnection) {
  const tokens = decryptAdConnection(connection);
  const expiresMs = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : null;
  const needsRefresh =
    Boolean(tokens.refreshToken) &&
    (expiresMs == null || expiresMs <= Date.now() + 60_000);

  if (!needsRefresh || !tokens.refreshToken) {
    return { accessToken: tokens.accessToken, connection };
  }

  const provider = getAdsProvider(connection.platform);
  if (!provider.refreshAccessToken) {
    return { accessToken: tokens.accessToken, connection };
  }

  const refreshed = await provider.refreshAccessToken({
    refreshToken: tokens.refreshToken,
  });

  const supabase = createAdminClient();
  const nextRefresh = refreshed.refreshToken ?? tokens.refreshToken;
  const { data, error } = await supabase
    .from("ad_connections")
    .update({
      access_token_encrypted: encryptSecret(refreshed.accessToken),
      refresh_token_encrypted: nextRefresh
        ? encryptSecret(nextRefresh)
        : connection.refresh_token_encrypted,
      token_expires_at: refreshed.expiresAt?.toISOString() ?? null,
      last_error: null,
    })
    .eq("id", connection.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to persist refreshed Ads token");
  }

  return {
    accessToken: refreshed.accessToken,
    connection: data as AdConnection,
  };
}

export async function listOrgAdConnections(organizationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ad_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdConnection[];
}

export {
  parseAdsSettings,
  type AdsOrgSettingsResolved,
} from "@/lib/ads/settings";
