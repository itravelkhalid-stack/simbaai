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
};

export type CreateCampaignResult = {
  platformCampaignId: string;
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
  listAccounts(input: { accessToken: string }): Promise<AdsAccount[]>;
  createCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult>;
  updateBudget(input: UpdateBudgetInput): Promise<void>;
  pauseCampaign(input: {
    accessToken: string;
    accountId: string;
    platformCampaignId: string;
  }): Promise<void>;
  uploadCreative(input: UploadCreativeInput): Promise<{ platformCreativeId: string }>;
  fetchDailyMetrics(input: FetchMetricsInput): Promise<DailyMetricRow[]>;
}
