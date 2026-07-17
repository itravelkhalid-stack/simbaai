import { upsertAdConnection } from "@/lib/ads/connections";
import { getAdsProvider } from "@/lib/ads/providers";
import { verifyOAuthState } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdPlatform } from "@/lib/types/ads";

async function primaryBrandId(organizationId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data) return data.id;
  const { data: fallback } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (!fallback) throw new Error("No brand found — create a brand first");
  return fallback.id;
}

export async function completeAdOAuth(params: {
  platform: AdPlatform;
  code: string;
  state: string;
}) {
  const payload = verifyOAuthState(params.state);
  if (payload.platform !== params.platform) throw new Error("State mismatch");
  const organizationId = payload.organizationId;
  if (!organizationId) throw new Error("Missing organization in state");
  const provider = getAdsProvider(params.platform);
  if (!provider.exchangeCode) throw new Error("OAuth not supported");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const redirectUri = `${site}/api/ads/oauth/${params.platform}/callback`;
  const tokens = await provider.exchangeCode({
    code: params.code,
    redirectUri,
  });
  const accounts = await provider.listAccounts({
    accessToken: tokens.accessToken,
  });
  const brandId = await primaryBrandId(organizationId);
  const primary = accounts[0];
  await upsertAdConnection({
    organizationId,
    brandId,
    platform: params.platform,
    tokens: {
      ...tokens,
      accountId: primary?.accountId ?? tokens.accountId,
      accountName: primary?.accountName ?? tokens.accountName,
      metadata: {
        ...(tokens.metadata ?? {}),
        accounts,
      },
    },
  });
}
