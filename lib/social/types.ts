import type { ContentPlatform } from "@/lib/types/content";

export type SocialConnectionStatus = "active" | "expired" | "revoked" | "error";

export type SocialConnection = {
  id: string;
  organization_id: string;
  brand_id: string;
  platform: ContentPlatform;
  account_name: string;
  account_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string[];
  status: SocialConnectionStatus;
  /** Soft pause — tokens kept; publish/metrics/gen skip while true. */
  paused: boolean;
  metadata: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentMetric = {
  id: string;
  organization_id: string;
  content_item_id: string;
  platform: ContentPlatform;
  platform_post_id: string;
  captured_at: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  raw: Record<string, unknown>;
  created_at: string;
};

export type SocialAccountMetricDaily = {
  id: string;
  organization_id: string;
  brand_id: string;
  connection_id: string | null;
  platform: ContentPlatform;
  account_id: string;
  metric_date: string;
  followers: number;
  raw: Record<string, unknown>;
  created_at: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
  accountId: string;
  accountName: string;
  metadata?: Record<string, unknown>;
};

export type PublishInput = {
  accessToken: string;
  accountId: string;
  metadata: Record<string, unknown>;
  copy: string;
  hashtags: string[];
  mediaUrls: string[];
  format: string;
  structured: Record<string, unknown>;
};

export type PostMetrics = {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  raw?: Record<string, unknown>;
};

export type AccountFollowers = {
  followers: number;
  raw?: Record<string, unknown>;
};

export interface SocialProvider {
  id: ContentPlatform;
  displayName: string;
  /** Platforms that share this OAuth app (e.g. Meta covers facebook + instagram). */
  covers?: ContentPlatform[];
  getAuthorizationUrl(input: { state: string; redirectUri: string }): string;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<TokenSet>;
  refreshToken(input: {
    refreshToken: string;
    accessToken?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TokenSet>;
  publishPost(input: PublishInput): Promise<{ platformPostId: string }>;
  getPostMetrics(input: {
    accessToken: string;
    accountId: string;
    platformPostId: string;
    metadata?: Record<string, unknown>;
  }): Promise<PostMetrics>;
  /** Account-level followers (IG / FB). Optional — other platforms may omit. */
  getAccountFollowers?(input: {
    accessToken: string;
    accountId: string;
    metadata?: Record<string, unknown>;
  }): Promise<AccountFollowers>;
}

export function expiresWithinDays(
  expiresAt: string | null | undefined,
  days: number,
): boolean {
  if (!expiresAt) return false;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms > 0 && ms <= days * 24 * 60 * 60 * 1000;
}

export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() <= Date.now();
}
