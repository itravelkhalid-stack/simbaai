import { encryptSecret, decryptSecret } from "@/lib/crypto";
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
