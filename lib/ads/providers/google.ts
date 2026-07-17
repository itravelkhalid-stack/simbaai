import { createWriteStubs, emptyMetrics } from "@/lib/ads/providers/stub";
import type { AdsAccount, AdsProvider } from "@/lib/ads/providers/types";

/**
 * Google Ads — metrics-read stub. Full API needs developer token + OAuth.
 * See docs/ads-apis.md.
 */
export const googleAdsProvider: AdsProvider = {
  id: "google",
  displayName: "Google Ads",
  supportsOAuth: Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  ),
  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set(
      "scope",
      "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email",
    );
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    return url.toString();
  },
  async exchangeCode() {
    throw new Error(
      "Google Ads OAuth exchange requires GOOGLE_ADS_DEVELOPER_TOKEN and customer binding — connect via access token for now. See docs/ads-apis.md.",
    );
  },
  async listAccounts({ accessToken }): Promise<AdsAccount[]> {
    // Without developer token we cannot list; return placeholder from token metadata usage
    void accessToken;
    return [];
  },
  ...createWriteStubs("google"),
  fetchDailyMetrics: emptyMetrics,
};
