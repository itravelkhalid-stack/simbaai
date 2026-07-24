import { createWriteStubs, emptyMetrics } from "@/lib/ads/providers/stub";
import type { AdsAccount, AdsProvider } from "@/lib/ads/providers/types";

/**
 * Microsoft Advertising (Bing) — needs developer token + OAuth.
 * Metrics-read stub; document setup in docs/ads-apis.md.
 */
export const bingAdsProvider: AdsProvider = {
  id: "bing",
  displayName: "Microsoft Advertising",
  get supportsOAuth() {
    return Boolean(
      process.env.MICROSOFT_ADS_CLIENT_ID &&
        process.env.MICROSOFT_ADS_CLIENT_SECRET,
    );
  },
  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = process.env.MICROSOFT_ADS_CLIENT_ID!;
    const url = new URL(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set(
      "scope",
      "openid offline_access https://ads.microsoft.com/msads.manage",
    );
    url.searchParams.set("state", state);
    return url.toString();
  },
  async exchangeCode() {
    throw new Error(
      "Microsoft Advertising OAuth requires developer token setup. Connect via access token for now. See docs/ads-apis.md.",
    );
  },
  async listAccounts({ accessToken }): Promise<AdsAccount[]> {
    void accessToken;
    return [];
  },
  ...createWriteStubs("bing"),
  fetchDailyMetrics: emptyMetrics,
};
