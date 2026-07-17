import { adsFetchJson } from "@/lib/ads/providers/http";
import { createWriteStubs } from "@/lib/ads/providers/stub";
import type {
  AdsAccount,
  AdsProvider,
  AdsTokenSet,
  DailyMetricRow,
  FetchMetricsInput,
} from "@/lib/ads/providers/types";

/**
 * TikTok Marketing API — OAuth + metrics read when credentials exist.
 * Campaign create/update gated by ADS_WRITES_ENABLED.
 */
export const tiktokAdsProvider: AdsProvider = {
  id: "tiktok",
  displayName: "TikTok Ads",
  supportsOAuth: Boolean(
    process.env.TIKTOK_ADS_APP_ID && process.env.TIKTOK_ADS_SECRET,
  ),
  getAuthorizationUrl({ state, redirectUri }) {
    const appId = process.env.TIKTOK_ADS_APP_ID!;
    const url = new URL("https://business-api.tiktok.com/portal/auth");
    url.searchParams.set("app_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  },
  async exchangeCode({ code }): Promise<AdsTokenSet> {
    const appId = process.env.TIKTOK_ADS_APP_ID!;
    const secret = process.env.TIKTOK_ADS_SECRET!;
    const data = await adsFetchJson<{
      data?: {
        access_token: string;
        advertiser_ids?: string[];
        refresh_token?: string;
      };
      message?: string;
      code?: number;
    }>("https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: appId,
        secret,
        auth_code: code,
      }),
    });
    if (!data.data?.access_token) {
      throw new Error(data.message ?? "TikTok Ads token exchange failed");
    }
    const advertiserId = data.data.advertiser_ids?.[0] ?? "unknown";
    return {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      accountId: advertiserId,
      accountName: `TikTok ${advertiserId}`,
      scopes: ["ads"],
    };
  },
  async listAccounts({ accessToken }): Promise<AdsAccount[]> {
    try {
      const data = await adsFetchJson<{
        data?: { list?: Array<{ advertiser_id: string; advertiser_name: string }> };
      }>("https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/", {
        headers: { "Access-Token": accessToken },
      });
      return (data.data?.list ?? []).map((a) => ({
        accountId: String(a.advertiser_id),
        accountName: a.advertiser_name,
      }));
    } catch {
      return [];
    }
  },
  ...createWriteStubs("tiktok"),
  async fetchDailyMetrics(input: FetchMetricsInput): Promise<DailyMetricRow[]> {
    try {
      const data = await adsFetchJson<{
        data?: {
          list?: Array<{
            dimensions?: { stat_time_day?: string };
            metrics?: {
              spend?: string;
              impressions?: string;
              clicks?: string;
              conversion?: string;
              total_purchase_value?: string;
            };
          }>;
        };
      }>("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/", {
        method: "POST",
        headers: {
          "Access-Token": input.accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          advertiser_id: input.accountId,
          report_type: "BASIC",
          dimensions: ["stat_time_day"],
          data_level: "AUCTION_CAMPAIGN",
          filters: [
            {
              field_name: "campaign_ids",
              filter_type: "IN",
              filter_value: JSON.stringify([input.platformCampaignId]),
            },
          ],
          start_date: input.since,
          end_date: input.until,
          metrics: [
            "spend",
            "impressions",
            "clicks",
            "conversion",
            "total_purchase_value",
          ],
        }),
      });
      return (data.data?.list ?? []).map((row) => {
        const spend = Math.round(Number(row.metrics?.spend ?? 0) * 100);
        const revenue = Math.round(
          Number(row.metrics?.total_purchase_value ?? 0) * 100,
        );
        return {
          date: String(row.dimensions?.stat_time_day ?? input.since).slice(0, 10),
          spendPence: spend,
          impressions: Number(row.metrics?.impressions ?? 0),
          clicks: Number(row.metrics?.clicks ?? 0),
          conversions: Number(row.metrics?.conversion ?? 0),
          revenuePence: revenue,
          raw: row as unknown as Record<string, unknown>,
        };
      });
    } catch {
      return [];
    }
  },
};
