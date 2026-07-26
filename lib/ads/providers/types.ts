import type { AdPlatform } from "@/lib/types/ads";

export type AdsTokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  accountId: string;
  accountName: string;
  metadata?: Record<string, unknown>;
};

export type AdsAccount = {
  accountId: string;
  accountName: string;
  currency?: string;
  timezone?: string;
  metadata?: Record<string, unknown>;
};

export type CreateCampaignInput = {
  accessToken: string;
  accountId: string;
  name: string;
  objective?: string;
  dailyBudgetPence?: number;
  lifetimeBudgetPence?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
  targeting?: Record<string, unknown>;
  /** Destination URL for Meta link ads / Google RSA final URL. */
  finalUrl: string;
  /** Approved local creatives used to build platform creative/ad resources. */
  creatives: Array<{
    localCreativeId: string;
    headline?: string | null;
    primaryText?: string | null;
    description?: string | null;
    cta?: string | null;
    mediaUrls: string[];
  }>;
  /** Connection/provider context (login customer, Page, IG user, etc.). */
  metadata?: Record<string, unknown>;
};

export type CreateCampaignResult = {
  platformCampaignId: string;
  platformAdSetId?: string | null;
  platformAdId?: string | null;
  platformBudgetId?: string | null;
  platformCreativeIds?: string[];
  status?: string;
  raw?: Record<string, unknown>;
};

export type UpdateBudgetInput = {
  accessToken: string;
  accountId: string;
  platformCampaignId: string;
  dailyBudgetPence?: number;
  lifetimeBudgetPence?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
};

export type UploadCreativeInput = {
  accessToken: string;
  accountId: string;
  platformCampaignId: string;
  format: string;
  headline?: string;
  primaryText?: string;
  description?: string;
  cta?: string;
  mediaUrls: string[];
  finalUrl?: string;
  metadata?: Record<string, unknown>;
};

export type DailyMetricRow = {
  date: string;
  spendPence: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenuePence: number;
  currency?: string;
  raw?: Record<string, unknown>;
};

export type FetchMetricsInput = {
  accessToken: string;
  accountId: string;
  platformCampaignId: string;
  since: string;
  until: string;
  /** Connection metadata (e.g. login_customer_id, currency). */
  metadata?: Record<string, unknown>;
};

export class AdsWriteDisabledError extends Error {
  constructor(platform: AdPlatform) {
    super(
      `Write operations for ${platform} are disabled. Enable ADS_WRITES_ENABLED=true after API access is approved. See docs/ads-apis.md.`,
    );
    this.name = "AdsWriteDisabledError";
  }
}

export function adsWritesEnabled(platform?: AdPlatform): boolean {
  if (process.env.ADS_WRITES_ENABLED !== "true") return false;
  if (!platform) return true;
  const key = `ADS_WRITES_${platform.toUpperCase()}`;
  const specific = process.env[key];
  if (specific === "false") return false;
  if (specific === "true") return true;
  return true;
}

export interface AdsProvider {
  id: AdPlatform;
  displayName: string;
  /** OAuth available when app credentials are configured. */
  supportsOAuth: boolean;
  getAuthorizationUrl?(input: { state: string; redirectUri: string }): string;
  exchangeCode?(input: {
    code: string;
    redirectUri: string;
  }): Promise<AdsTokenSet>;
  /** Refresh OAuth access token when the provider supports offline access. */
  refreshAccessToken?(input: {
    refreshToken: string;
  }): Promise<{
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    scopes?: string[];
  }>;
  listAccounts(input: { accessToken: string }): Promise<AdsAccount[]>;
  createCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult>;
  updateBudget(input: UpdateBudgetInput): Promise<void>;
  pauseCampaign(input: {
    accessToken: string;
    accountId: string;
    platformCampaignId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  setCampaignStatus(input: {
    accessToken: string;
    accountId: string;
    platformCampaignId: string;
    status: "active" | "paused" | "archived";
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  uploadCreative(input: UploadCreativeInput): Promise<{ platformCreativeId: string }>;
  fetchDailyMetrics(input: FetchMetricsInput): Promise<DailyMetricRow[]>;
}
