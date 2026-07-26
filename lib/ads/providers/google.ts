import {
  currencyUnitsToMinor,
  exchangeGoogleOAuthCode,
  googleAdsLoginCustomerId,
  googleAdsMutate,
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
import {
  AdsWriteDisabledError,
  adsWritesEnabled,
} from "@/lib/ads/providers/types";

const GOOGLE_ADS_SCOPES = [
  "https://www.googleapis.com/auth/adwords",
  "https://www.googleapis.com/auth/userinfo.email",
];

/**
 * Google Ads — OAuth + account list + daily campaign metrics (searchStream).
 * Campaign writes are gated behind ADS_WRITES_ENABLED and create PAUSED only.
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

  async createCampaign(input) {
    if (!adsWritesEnabled("google")) throw new AdsWriteDisabledError("google");
    const customerId = normalizeGoogleAdsCustomerId(input.accountId);
    const loginCustomerId =
      (typeof input.metadata?.login_customer_id === "string"
        ? input.metadata.login_customer_id
        : null) || googleAdsLoginCustomerId();
    const headlines = Array.from(
      new Set(
        input.creatives
          .map((creative) => creative.headline?.trim())
          .filter((value): value is string => Boolean(value))
          .map((value) => value.slice(0, 30)),
      ),
    ).slice(0, 15);
    const descriptions = Array.from(
      new Set(
        input.creatives
          .flatMap((creative) => [
            creative.description?.trim(),
            creative.primaryText?.trim(),
          ])
          .filter((value): value is string => Boolean(value))
          .map((value) => value.slice(0, 90)),
      ),
    ).slice(0, 4);
    if (headlines.length < 3 || descriptions.length < 2) {
      throw new Error(
        "Google Search RSA requires at least 3 distinct approved headlines and 2 distinct approved descriptions. Approve more creative variants first.",
      );
    }
    if (!input.dailyBudgetPence || input.dailyBudgetPence <= 0) {
      throw new Error("Google Search campaign requires a positive daily budget");
    }
    const geoTargets: Record<string, string> = {
      GB: "2826",
      US: "2840",
      CA: "2124",
      AU: "2036",
      IE: "2372",
    };
    const countryCodes = Array.isArray(input.targeting?.countries)
      ? (input.targeting.countries as unknown[])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.toUpperCase())
      : ["GB"];
    const unsupportedCountries = countryCodes.filter(
      (code) => !geoTargets[code],
    );
    if (unsupportedCountries.length) {
      throw new Error(
        `Google Ads country targeting is not mapped for: ${unsupportedCountries.join(", ")}. Supported in Phase C: ${Object.keys(geoTargets).join(", ")}.`,
      );
    }

    type MutateResponse = {
      mutateOperationResponses?: Array<{
        campaignBudgetResult?: { resourceName?: string };
        campaignResult?: { resourceName?: string };
        adGroupResult?: { resourceName?: string };
        adGroupAdResult?: { resourceName?: string };
      }>;
    };
    const result = await googleAdsMutate<MutateResponse>({
      accessToken: input.accessToken,
      customerId,
      loginCustomerId,
      path: "googleAds:mutate",
      body: {
        responseContentType: "RESOURCE_NAME_ONLY",
        mutateOperations: [
          {
            campaignBudgetOperation: {
              create: {
                resourceName: `customers/${customerId}/campaignBudgets/-1`,
                name: `${input.name} — Budget ${Date.now()}`,
                deliveryMethod: "STANDARD",
                amountMicros: String(input.dailyBudgetPence * 10_000),
                explicitlyShared: false,
              },
            },
          },
          {
            campaignOperation: {
              create: {
                resourceName: `customers/${customerId}/campaigns/-2`,
                name: `${input.name} ${Date.now()}`,
                status: "PAUSED",
                advertisingChannelType: "SEARCH",
                campaignBudget: `customers/${customerId}/campaignBudgets/-1`,
                targetSpend: {},
                geoTargetTypeSetting: {
                  positiveGeoTargetType: "PRESENCE_OR_INTEREST",
                  negativeGeoTargetType: "PRESENCE_OR_INTEREST",
                },
                networkSettings: {
                  targetGoogleSearch: true,
                  targetSearchNetwork: false,
                  targetContentNetwork: false,
                  targetPartnerSearchNetwork: false,
                },
              },
            },
          },
          ...countryCodes.map((code) => ({
            campaignCriterionOperation: {
              create: {
                campaign: `customers/${customerId}/campaigns/-2`,
                location: {
                  geoTargetConstant: `geoTargetConstants/${geoTargets[code]}`,
                },
                negative: false,
              },
            },
          })),
          {
            adGroupOperation: {
              create: {
                resourceName: `customers/${customerId}/adGroups/-3`,
                campaign: `customers/${customerId}/campaigns/-2`,
                name: `${input.name} — Ad group`,
                status: "PAUSED",
                type: "SEARCH_STANDARD",
              },
            },
          },
          {
            adGroupAdOperation: {
              create: {
                adGroup: `customers/${customerId}/adGroups/-3`,
                status: "PAUSED",
                ad: {
                  finalUrls: [input.finalUrl],
                  responsiveSearchAd: {
                    headlines: headlines.map((text) => ({ text })),
                    descriptions: descriptions.map((text) => ({ text })),
                  },
                },
              },
            },
          },
        ],
      },
    });

    const responses = result.mutateOperationResponses ?? [];
    const budgetResource = responses.find((row) => row.campaignBudgetResult)
      ?.campaignBudgetResult?.resourceName;
    const campaignResource = responses.find((row) => row.campaignResult)
      ?.campaignResult?.resourceName;
    const adGroupResource = responses.find((row) => row.adGroupResult)
      ?.adGroupResult?.resourceName;
    const adResource = responses.find((row) => row.adGroupAdResult)
      ?.adGroupAdResult?.resourceName;
    if (!campaignResource) {
      throw new Error("Google Ads mutation did not return a campaign resource");
    }
    const resourceId = (value?: string) => value?.split("/").pop() ?? null;
    return {
      platformCampaignId: resourceId(campaignResource)!,
      platformBudgetId: resourceId(budgetResource),
      platformAdSetId: resourceId(adGroupResource),
      platformAdId: resourceId(adResource),
      platformCreativeIds: adResource ? [adResource] : [],
      status: "PAUSED",
      raw: {
        campaign_resource: campaignResource,
        budget_resource: budgetResource ?? null,
        ad_group_resource: adGroupResource ?? null,
        ad_resource: adResource ?? null,
        approved_creative_ids: input.creatives.map(
          (creative) => creative.localCreativeId,
        ),
      },
    };
  },

  async updateBudget(input) {
    if (!adsWritesEnabled("google")) throw new AdsWriteDisabledError("google");
    const customerId = normalizeGoogleAdsCustomerId(input.accountId);
    const budgetId =
      typeof input.metadata?.platform_budget_id === "string"
        ? input.metadata.platform_budget_id
        : null;
    if (!budgetId || input.dailyBudgetPence == null) {
      throw new Error(
        "Google budget update requires platform budget ID and daily budget",
      );
    }
    await googleAdsMutate({
      accessToken: input.accessToken,
      customerId,
      loginCustomerId:
        (typeof input.metadata?.login_customer_id === "string"
          ? input.metadata.login_customer_id
          : null) || googleAdsLoginCustomerId(),
      path: "campaignBudgets:mutate",
      body: {
        operations: [
          {
            update: {
              resourceName: `customers/${customerId}/campaignBudgets/${budgetId}`,
              amountMicros: String(input.dailyBudgetPence * 10_000),
            },
            updateMask: "amountMicros",
          },
        ],
      },
    });
  },

  async pauseCampaign(input) {
    if (!adsWritesEnabled("google")) throw new AdsWriteDisabledError("google");
    await googleAdsMutate({
      accessToken: input.accessToken,
      customerId: input.accountId,
      loginCustomerId:
        (typeof input.metadata?.login_customer_id === "string"
          ? input.metadata.login_customer_id
          : null) || googleAdsLoginCustomerId(),
      path: "campaigns:mutate",
      body: {
        operations: [
          {
            update: {
              resourceName: `customers/${normalizeGoogleAdsCustomerId(input.accountId)}/campaigns/${input.platformCampaignId.replace(/\D/g, "")}`,
              status: "PAUSED",
            },
            updateMask: "status",
          },
        ],
      },
    });
  },

  async setCampaignStatus(input) {
    if (!adsWritesEnabled("google")) throw new AdsWriteDisabledError("google");
    const customerId = normalizeGoogleAdsCustomerId(input.accountId);
    const loginCustomerId =
      (typeof input.metadata?.login_customer_id === "string"
        ? input.metadata.login_customer_id
        : null) || googleAdsLoginCustomerId();
    const campaignResource = `customers/${customerId}/campaigns/${input.platformCampaignId.replace(/\D/g, "")}`;
    if (input.status === "archived") {
      await googleAdsMutate({
        accessToken: input.accessToken,
        customerId,
        loginCustomerId,
        path: "campaigns:mutate",
        body: { operations: [{ remove: campaignResource }] },
      });
      return;
    }
    const status = input.status === "active" ? "ENABLED" : "PAUSED";
    await googleAdsMutate({
      accessToken: input.accessToken,
      customerId,
      loginCustomerId,
      path: "campaigns:mutate",
      body: {
        operations: [
          {
            update: { resourceName: campaignResource, status },
            updateMask: "status",
          },
        ],
      },
    });
    if (input.status === "active") {
      const adGroupId =
        typeof input.metadata?.platform_adset_id === "string"
          ? input.metadata.platform_adset_id
          : null;
      const adId =
        typeof input.metadata?.platform_ad_id === "string"
          ? input.metadata.platform_ad_id
          : null;
      if (adGroupId) {
        await googleAdsMutate({
          accessToken: input.accessToken,
          customerId,
          loginCustomerId,
          path: "adGroups:mutate",
          body: {
            operations: [
              {
                update: {
                  resourceName: `customers/${customerId}/adGroups/${adGroupId}`,
                  status: "ENABLED",
                },
                updateMask: "status",
              },
            ],
          },
        });
      }
      if (adId) {
        await googleAdsMutate({
          accessToken: input.accessToken,
          customerId,
          loginCustomerId,
          path: "adGroupAds:mutate",
          body: {
            operations: [
              {
                update: {
                  resourceName: adId.startsWith("customers/")
                    ? adId
                    : `customers/${customerId}/adGroupAds/${adId}`,
                  status: "ENABLED",
                },
                updateMask: "status",
              },
            ],
          },
        });
      }
    }
  },

  async uploadCreative(input) {
    if (!adsWritesEnabled("google")) throw new AdsWriteDisabledError("google");
    const customerId = normalizeGoogleAdsCustomerId(input.accountId);
    const adGroupId =
      typeof input.metadata?.platform_adset_id === "string"
        ? input.metadata.platform_adset_id
        : null;
    const headlines = Array.isArray(input.metadata?.headlines)
      ? (input.metadata.headlines as string[])
      : [input.headline ?? ""];
    const descriptions = Array.isArray(input.metadata?.descriptions)
      ? (input.metadata.descriptions as string[])
      : [input.description ?? "", input.primaryText ?? ""];
    if (!adGroupId || !input.finalUrl || headlines.length < 3) {
      throw new Error(
        "Google creative upload requires an ad group, final URL, and 3 headlines",
      );
    }
    const result = await googleAdsMutate<{
      results?: Array<{ resourceName?: string }>;
    }>({
      accessToken: input.accessToken,
      customerId,
      loginCustomerId:
        (typeof input.metadata?.login_customer_id === "string"
          ? input.metadata.login_customer_id
          : null) || googleAdsLoginCustomerId(),
      path: "adGroupAds:mutate",
      body: {
        operations: [
          {
            create: {
              adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
              status: "PAUSED",
              ad: {
                finalUrls: [input.finalUrl],
                responsiveSearchAd: {
                  headlines: headlines.slice(0, 15).map((text) => ({
                    text: text.slice(0, 30),
                  })),
                  descriptions: descriptions
                    .filter(Boolean)
                    .slice(0, 4)
                    .map((text) => ({ text: text.slice(0, 90) })),
                },
              },
            },
          },
        ],
      },
    });
    const resourceName = result.results?.[0]?.resourceName;
    if (!resourceName) throw new Error("Google creative upload returned no ad ID");
    return { platformCreativeId: resourceName };
  },

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
