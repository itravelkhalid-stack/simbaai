import { adsFetchJson } from "@/lib/ads/providers/http";
import { createWriteStubs } from "@/lib/ads/providers/stub";
import type {
  AdsAccount,
  AdsProvider,
  AdsTokenSet,
  DailyMetricRow,
  FetchMetricsInput,
} from "@/lib/ads/providers/types";

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaAdAccount = {
  id: string;
  account_id: string;
  name: string;
  currency?: string;
  timezone_name?: string;
};

type MetaInsightsRow = {
  date_start: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
};

function metaApp() {
  const id = process.env.META_APP_ID;
  const secret = process.env.META_APP_SECRET;
  if (!id || !secret) throw new Error("META_APP_ID / META_APP_SECRET required for Meta Ads");
  return { id, secret };
}

export const metaAdsProvider: AdsProvider = {
  id: "meta",
  displayName: "Meta Ads",
  supportsOAuth: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
  getAuthorizationUrl({ state, redirectUri }) {
    const { id } = metaApp();
    const scopes = [
      "ads_management",
      "ads_read",
      "business_management",
      "pages_read_engagement",
    ].join(",");
    const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", scopes);
    return url.toString();
  },
  async exchangeCode({ code, redirectUri }): Promise<AdsTokenSet> {
    const { id, secret } = metaApp();
    const url = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    url.searchParams.set("client_id", id);
    url.searchParams.set("client_secret", secret);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("code", code);
    const short = await adsFetchJson<MetaTokenResponse>(url.toString());

    const longUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", id);
    longUrl.searchParams.set("client_secret", secret);
    longUrl.searchParams.set("fb_exchange_token", short.access_token);
    const longLived = await adsFetchJson<MetaTokenResponse>(longUrl.toString());

    const me = await adsFetchJson<{ id: string; name: string }>(
      `https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(longLived.access_token)}`,
    );

    return {
      accessToken: longLived.access_token,
      expiresAt: longLived.expires_in
        ? new Date(Date.now() + longLived.expires_in * 1000)
        : null,
      scopes: ["ads_management", "ads_read"],
      accountId: me.id,
      accountName: me.name,
    };
  },
  async listAccounts({ accessToken }): Promise<AdsAccount[]> {
    const data = await adsFetchJson<{ data: MetaAdAccount[] }>(
      `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,account_id,name,currency,timezone_name&access_token=${encodeURIComponent(accessToken)}`,
    );
    return (data.data ?? []).map((a) => ({
      accountId: a.id,
      accountName: a.name,
      currency: a.currency,
      timezone: a.timezone_name,
      metadata: { act_account_id: a.account_id },
    }));
  },
  ...createWriteStubs("meta"),
  async fetchDailyMetrics(input: FetchMetricsInput): Promise<DailyMetricRow[]> {
    const actId = input.accountId.startsWith("act_")
      ? input.accountId
      : `act_${input.accountId}`;
    const url = new URL(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(input.platformCampaignId)}/insights`,
    );
    url.searchParams.set(
      "fields",
      "date_start,spend,impressions,clicks,actions,action_values",
    );
    url.searchParams.set("time_increment", "1");
    url.searchParams.set(
      "time_range",
      JSON.stringify({ since: input.since, until: input.until }),
    );
    url.searchParams.set("access_token", input.accessToken);
    // accountId kept for future account-level fallbacks
    void actId;

    try {
      const data = await adsFetchJson<{ data: MetaInsightsRow[] }>(url.toString());
      return (data.data ?? []).map((row) => {
        const spend = Math.round(Number(row.spend ?? 0) * 100);
        const purchases =
          row.actions?.find((a) => a.action_type === "purchase")?.value ??
          row.actions?.find((a) => a.action_type === "omni_purchase")?.value ??
          "0";
        const purchaseValue =
          row.action_values?.find((a) => a.action_type === "purchase")?.value ??
          row.action_values?.find((a) => a.action_type === "omni_purchase")
            ?.value ??
          "0";
        return {
          date: row.date_start,
          spendPence: spend,
          impressions: Number(row.impressions ?? 0),
          clicks: Number(row.clicks ?? 0),
          conversions: Number(purchases),
          revenuePence: Math.round(Number(purchaseValue) * 100),
          raw: row as unknown as Record<string, unknown>,
        };
      });
    } catch {
      // Campaign-level insights may fail if ID is local-only; return empty
      return [];
    }
  },
};
