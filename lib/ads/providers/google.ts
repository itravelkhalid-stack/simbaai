import { createWriteStubs } from "@/lib/ads/providers/stub";
import {
  currencyUnitsToMinor,
  exchangeGoogleOAuthCode,
  googleAdsLoginCustomerId,
  googleAdsSearchStream,
  listAccessibleCustomerIds,
  microsToMinorUnits,
  normalizeGoogleAdsCustomerId,
  refreshGoogleAccessToken,
} from "@/lib/ads/providers/google-ads-api";
import type {
  AdsAccount,
  AdsProvider,
  AdsTokenSet,
  DailyMetricRow,
  FetchMetricsInput,
} from "@/lib/ads/providers/types";

const GOOGLE_ADS_SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Google Ads — OAuth + account list + daily campaign metrics (searchStream).
 * Campaign writes remain stubbed behind ADS_WRITES_ENABLED.
 */
export const googleAdsProvider: AdsProvider = {
  id: "google",
  displayName: "Google Ads",
  get supportsOAuth() {
    return Boolean(
      process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET &&
        process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    );
  },

  getAuthorizationUrl({ state, redirectUri }) {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_ADS_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }): Promise<AdsTokenSet> {
    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
      throw new Error(
        "GOOGLE_ADS_DEVELOPER_TOKEN is required before connecting Google Ads",
      );
    }

    const token = await exchangeGoogleOAuthCode({ code, redirectUri });
    if (!token.refreshToken) {
      throw new Error(
        "Google did not return a refresh_token. Revoke prior app access at https://myaccount.google.com/permissions and reconnect with prompt=consent.",
      );
    }

    const accounts = await listGoogleAdsAccounts(token.accessToken);
    const primary = accounts[0];
    const loginCustomerId = googleAdsLoginCustomerId();

    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: token.expiresAt,
      scopes: token.scopes.length ? token.scopes : GOOGLE_ADS_SCOPES,
      accountId: primary?.accountId ?? "pending",
      accountName: primary?.accountName ?? "Google Ads",
      metadata: {
        accounts,
        login_customer_id: loginCustomerId,
        google_ads_api: true,
      },
    };
  },

  async refreshAccessToken({ refreshToken }) {
    const refreshed = await refreshGoogleAccessToken(refreshToken);
    return {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: refreshed.expiresAt,
      scopes: refreshed.scopes,
    };
  },

  async listAccounts({ accessToken }): Promise<AdsAccount[]> {
    return listGoogleAdsAccounts(accessToken);
  },

  ...createWriteStubs("google"),

  async fetchDailyMetrics(input: FetchMetricsInput): Promise<DailyMetricRow[]> {
    const customerId = normalizeGoogleAdsCustomerId(input.accountId);
    const campaignId = String(input.platformCampaignId).replace(/\D/g, "");
    if (!campaignId) {
      throw new Error("Google Ads campaign id is required for metrics");
    }

    const loginCustomerId =
      (typeof input.metadata?.login_customer_id === "string"
        ? input.metadata.login_customer_id
        : null) || googleAdsLoginCustomerId();

    const query = `
      SELECT
        campaign.id,
        segments.date,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE campaign.id = ${campaignId}
        AND segments.date BETWEEN '${input.since}' AND '${input.until}'
      ORDER BY segments.date
    `.trim();

    const results = await googleAdsSearchStream({
      accessToken: input.accessToken,
      customerId,
      query,
      loginCustomerId,
    });

    const currency =
      typeof input.metadata?.currency === "string"
        ? input.metadata.currency
        : undefined;

    return (results ?? []).map((row) => {
      const metrics = row.metrics ?? {};
      const date = row.segments?.date ?? "";
      return {
        date,
        spendPence: microsToMinorUnits(metrics.costMicros ?? 0),
        impressions: Number(metrics.impressions ?? 0),
        clicks: Number(metrics.clicks ?? 0),
        conversions: Number(metrics.conversions ?? 0),
        revenuePence: currencyUnitsToMinor(metrics.conversionsValue ?? 0),
        currency,
        raw: row as unknown as Record<string, unknown>,
      };
    });
  },
};

async function listGoogleAdsAccounts(
  accessToken: string,
): Promise<AdsAccount[]> {
  const ids = await listAccessibleCustomerIds(accessToken);
  if (!ids.length) return [];

  const loginCustomerId = googleAdsLoginCustomerId();
  const accounts: AdsAccount[] = [];

  for (const customerId of ids) {
    try {
      const results = await googleAdsSearchStream({
        accessToken,
        customerId,
        loginCustomerId,
        query: `
          SELECT
            customer.id,
            customer.descriptive_name,
            customer.currency_code,
            customer.time_zone,
            customer.manager
          FROM customer
          LIMIT 1
        `.trim(),
      });
      const customer = results?.[0]?.customer;
      if (!customer?.id) continue;
      // Prefer leaf (non-manager) accounts for primary connection; still list managers
      accounts.push({
        accountId: normalizeGoogleAdsCustomerId(String(customer.id)),
        accountName:
          customer.descriptiveName ||
          `Google Ads ${normalizeGoogleAdsCustomerId(String(customer.id))}`,
        currency: customer.currencyCode,
        timezone: customer.timeZone,
        metadata: {
          manager: Boolean(customer.manager),
          login_customer_id: loginCustomerId,
        },
      });
    } catch {
      // Some accessible IDs may not be queryable with current login-customer-id
      accounts.push({
        accountId: customerId,
        accountName: `Google Ads ${customerId}`,
        metadata: { login_customer_id: loginCustomerId },
      });
    }
  }

  // Sort non-managers first so OAuth primary picks a client account when possible
  accounts.sort((a, b) => {
    const am = a.metadata?.manager ? 1 : 0;
    const bm = b.metadata?.manager ? 1 : 0;
    return am - bm;
  });

  return accounts;
}
