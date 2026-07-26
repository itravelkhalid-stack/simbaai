import { adsFetchJson } from "@/lib/ads/providers/http";
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

const META_GRAPH = "https://graph.facebook.com/v21.0";

function metaActId(accountId: string) {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

async function metaWrite<T>(
  path: string,
  accessToken: string,
  fields: Record<string, string | number | boolean>,
): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, String(value));
  }
  body.set("access_token", accessToken);
  return adsFetchJson<T>(`${META_GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

function metaObjective(value?: string) {
  const normalized = value?.toUpperCase() ?? "";
  if (normalized.includes("SALE") || normalized.includes("CONVERSION")) {
    return "OUTCOME_SALES";
  }
  if (normalized.includes("LEAD")) return "OUTCOME_LEADS";
  if (normalized.includes("AWARE")) return "OUTCOME_AWARENESS";
  if (normalized.includes("ENGAGE")) return "OUTCOME_ENGAGEMENT";
  return "OUTCOME_TRAFFIC";
}

function metaCta(value?: string | null) {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, "_");
  const allowed = new Set([
    "LEARN_MORE",
    "SHOP_NOW",
    "SIGN_UP",
    "BOOK_NOW",
    "CONTACT_US",
    "GET_QUOTE",
    "APPLY_NOW",
  ]);
  return normalized && allowed.has(normalized) ? normalized : "LEARN_MORE";
}

async function uploadMetaImage(params: {
  accountId: string;
  accessToken: string;
  imageUrl: string;
}) {
  const image = await fetch(params.imageUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!image.ok) {
    throw new Error(`Creative image returned HTTP ${image.status}`);
  }
  const contentType = image.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Creative URL must serve an image, got ${contentType || "unknown"}`);
  }
  const bytes = Buffer.from(await image.arrayBuffer()).toString("base64");
  const uploaded = await metaWrite<{
    images?: Record<string, { hash?: string }>;
  }>(`${metaActId(params.accountId)}/adimages`, params.accessToken, { bytes });
  const hash = Object.values(uploaded.images ?? {})[0]?.hash;
  if (!hash) throw new Error("Meta image upload did not return an image hash");
  return hash;
}

export const metaAdsProvider: AdsProvider = {
  id: "meta",
  displayName: "Meta Ads",
  get supportsOAuth() {
    return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
  },
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
  async createCampaign(input) {
    if (!adsWritesEnabled("meta")) throw new AdsWriteDisabledError("meta");
    const creative = input.creatives[0];
    if (!creative) throw new Error("An approved creative is required");
    const imageUrl = creative.mediaUrls[0];
    if (!imageUrl) {
      throw new Error("Meta campaign creation requires an approved creative image");
    }
    const pageId =
      typeof input.metadata?.page_id === "string"
        ? input.metadata.page_id
        : null;
    if (!pageId) {
      throw new Error(
        "Meta campaign creation requires a connected Facebook Page. Connect Meta under Social first.",
      );
    }

    const actId = metaActId(input.accountId);
    let campaignId: string | null = null;
    try {
      const campaign = await metaWrite<{ id: string }>(
        `${actId}/campaigns`,
        input.accessToken,
        {
          name: input.name,
          objective: metaObjective(input.objective),
          status: "PAUSED",
          special_ad_categories: JSON.stringify([]),
          is_adset_budget_sharing_enabled: false,
        },
      );
      campaignId = campaign.id;

      const countries = Array.isArray(input.targeting?.countries)
        ? (input.targeting.countries as unknown[])
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.toUpperCase())
        : ["GB"];
      const adSet = await metaWrite<{ id: string }>(
        `${actId}/adsets`,
        input.accessToken,
        {
          name: `${input.name} — Ad set`,
          campaign_id: campaign.id,
          daily_budget: input.dailyBudgetPence ?? 0,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          targeting: JSON.stringify({
            geo_locations: { countries: countries.length ? countries : ["GB"] },
          }),
          status: "PAUSED",
          ...(input.startDate ? { start_time: input.startDate } : {}),
          ...(input.endDate ? { end_time: input.endDate } : {}),
        },
      );

      const imageHash = await uploadMetaImage({
        accountId: input.accountId,
        accessToken: input.accessToken,
        imageUrl,
      });
      const igUserId =
        typeof input.metadata?.ig_user_id === "string"
          ? input.metadata.ig_user_id
          : null;
      const linkData: Record<string, unknown> = {
        image_hash: imageHash,
        link: input.finalUrl,
        message: creative.primaryText ?? "",
        name: creative.headline ?? input.name,
        description: creative.description ?? "",
        call_to_action: {
          type: metaCta(creative.cta),
          value: { link: input.finalUrl },
        },
      };
      const storySpec: Record<string, unknown> = {
        page_id: pageId,
        link_data: linkData,
      };
      if (igUserId) storySpec.instagram_user_id = igUserId;

      const remoteCreative = await metaWrite<{ id: string }>(
        `${actId}/adcreatives`,
        input.accessToken,
        {
          name: `${input.name} — Creative`,
          object_story_spec: JSON.stringify(storySpec),
        },
      );

      const ad = await metaWrite<{ id: string }>(
        `${actId}/ads`,
        input.accessToken,
        {
          name: `${input.name} — Ad`,
          adset_id: adSet.id,
          creative: JSON.stringify({ creative_id: remoteCreative.id }),
          status: "PAUSED",
        },
      );

      return {
        platformCampaignId: campaign.id,
        platformAdSetId: adSet.id,
        platformAdId: ad.id,
        platformCreativeIds: [remoteCreative.id],
        status: "PAUSED",
        raw: {
          campaign,
          ad_set: adSet,
          creative: remoteCreative,
          ad,
          local_creative_id: creative.localCreativeId,
        },
      };
    } catch (error) {
      if (campaignId) {
        try {
          await metaWrite(campaignId, input.accessToken, {
            status: "ARCHIVED",
          });
        } catch {
          // Best effort: never leave a partial campaign active (it was PAUSED).
        }
      }
      throw error;
    }
  },
  async updateBudget(input) {
    if (!adsWritesEnabled("meta")) throw new AdsWriteDisabledError("meta");
    const adSetId =
      typeof input.metadata?.platform_adset_id === "string"
        ? input.metadata.platform_adset_id
        : null;
    if (!adSetId) {
      throw new Error("Meta budget update requires the platform ad set ID");
    }
    await metaWrite(adSetId, input.accessToken, {
      ...(input.dailyBudgetPence != null
        ? { daily_budget: input.dailyBudgetPence }
        : {}),
      ...(input.lifetimeBudgetPence != null
        ? { lifetime_budget: input.lifetimeBudgetPence }
        : {}),
    });
  },
  async pauseCampaign(input) {
    if (!adsWritesEnabled("meta")) throw new AdsWriteDisabledError("meta");
    await metaWrite(input.platformCampaignId, input.accessToken, {
      status: "PAUSED",
    });
  },
  async setCampaignStatus(input) {
    if (!adsWritesEnabled("meta")) throw new AdsWriteDisabledError("meta");
    const status =
      input.status === "active"
        ? "ACTIVE"
        : input.status === "archived"
          ? "ARCHIVED"
          : "PAUSED";
    await metaWrite(input.platformCampaignId, input.accessToken, { status });
    if (input.status === "active") {
      const adSetId =
        typeof input.metadata?.platform_adset_id === "string"
          ? input.metadata.platform_adset_id
          : null;
      const adId =
        typeof input.metadata?.platform_ad_id === "string"
          ? input.metadata.platform_ad_id
          : null;
      if (adSetId) await metaWrite(adSetId, input.accessToken, { status: "ACTIVE" });
      if (adId) await metaWrite(adId, input.accessToken, { status: "ACTIVE" });
    }
  },
  async uploadCreative(input) {
    if (!adsWritesEnabled("meta")) throw new AdsWriteDisabledError("meta");
    const imageUrl = input.mediaUrls[0];
    const pageId =
      typeof input.metadata?.page_id === "string"
        ? input.metadata.page_id
        : null;
    if (!imageUrl || !pageId || !input.finalUrl) {
      throw new Error(
        "Meta creative upload requires an image, final URL, and connected Page",
      );
    }
    const imageHash = await uploadMetaImage({
      accountId: input.accountId,
      accessToken: input.accessToken,
      imageUrl,
    });
    const created = await metaWrite<{ id: string }>(
      `${metaActId(input.accountId)}/adcreatives`,
      input.accessToken,
      {
        name: input.headline || "GrowthOS creative",
        object_story_spec: JSON.stringify({
          page_id: pageId,
          link_data: {
            image_hash: imageHash,
            link: input.finalUrl,
            message: input.primaryText ?? "",
            name: input.headline ?? "",
            description: input.description ?? "",
            call_to_action: {
              type: metaCta(input.cta),
              value: { link: input.finalUrl },
            },
          },
        }),
      },
    );
    return { platformCreativeId: created.id };
  },
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
