import { createWriteStubs, emptyMetrics } from "@/lib/ads/providers/stub";
import type { AdsAccount, AdsProvider } from "@/lib/ads/providers/types";

/**
 * X Ads API — requires Ads API access application.
 * Metrics-read stub until approved; connect via pasted token.
 */
export const xAdsProvider: AdsProvider = {
  id: "x",
  displayName: "X Ads",
  supportsOAuth: Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET),
  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = process.env.X_CLIENT_ID!;
    const url = new URL("https://twitter.com/i/oauth2/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "tweet.read users.read offline.access");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", "challenge");
    url.searchParams.set("code_challenge_method", "plain");
    return url.toString();
  },
  async exchangeCode() {
    throw new Error(
      "X Ads API access is restricted. Connect with an Ads API bearer token manually. See docs/ads-apis.md.",
    );
  },
  async listAccounts({ accessToken }): Promise<AdsAccount[]> {
    void accessToken;
    return [];
  },
  ...createWriteStubs("x"),
  fetchDailyMetrics: emptyMetrics,
};
