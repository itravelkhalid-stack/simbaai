export type AdPlatform = "meta" | "tiktok" | "google" | "x" | "bing";

export type AdConnectionStatus =
  | "active"
  | "expired"
  | "revoked"
  | "error"
  | "pending";

export type AdCampaignStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "active"
  | "paused"
  | "completed"
  | "archived"
  | "error";

export type AdCreativeStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "live"
  | "paused"
  | "archived";

export type AdMediaPlanStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "archived";

export type AdRecommendationStatus =
  | "pending"
  | "applied"
  | "dismissed"
  | "failed";

export type AdRecommendationType =
  | "pause_campaign"
  | "activate_campaign"
  | "shift_budget"
  | "refresh_creative"
  | "adjust_targeting"
  | "other";

export const AD_PLATFORM_LABELS: Record<AdPlatform, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google Ads",
  x: "X Ads",
  bing: "Microsoft Advertising",
};

export type AdConnection = {
  id: string;
  organization_id: string;
  brand_id: string;
  platform: AdPlatform;
  account_id: string;
  account_name: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  scopes: string[];
  status: AdConnectionStatus;
  metadata: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AdMediaPlan = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  goal_brief: string;
  monthly_budget_pence: number;
  currency: string;
  target_roas: number | null;
  objective: string | null;
  plan: MediaPlanPayload;
  status: AdMediaPlanStatus;
  agent_run_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MediaPlanCampaignSpec = {
  name: string;
  platform: AdPlatform;
  objective: string;
  funnel_stage: string;
  daily_budget_pence: number;
  audience: string;
  targeting_notes: string;
  creative_requirements: string[];
};

export type MediaPlanPayload = {
  summary: string;
  platform_split: Array<{
    platform: AdPlatform;
    budget_pct: number;
    rationale: string;
  }>;
  funnel_stages: Array<{
    stage: string;
    budget_pct: number;
    goal: string;
  }>;
  campaigns: MediaPlanCampaignSpec[];
  creative_brief: string;
  risks: string[];
};

export type AdCampaign = {
  id: string;
  organization_id: string;
  brand_id: string;
  connection_id: string | null;
  media_plan_id: string | null;
  platform: AdPlatform;
  platform_campaign_id: string | null;
  name: string;
  objective: string | null;
  status: AdCampaignStatus;
  daily_budget_pence: number | null;
  lifetime_budget_pence: number | null;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  targeting: Record<string, unknown>;
  funnel_stage: string | null;
  target_roas: number | null;
  is_managed: boolean;
  last_sync_at: string | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AdCreative = {
  id: string;
  organization_id: string;
  brand_id: string;
  campaign_id: string;
  format: string;
  headline: string | null;
  primary_text: string | null;
  description: string | null;
  cta: string | null;
  hook: string | null;
  media_urls: string[];
  status: AdCreativeStatus;
  platform_creative_id: string | null;
  rejection_reason: string | null;
  variant_label: string | null;
  agent_run_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdMetricDaily = {
  id: string;
  organization_id: string;
  campaign_id: string;
  metric_date: string;
  spend_pence: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue_pence: number;
  cpm: number;
  cpc_pence: number;
  ctr: number;
  roas: number;
  currency: string;
  raw: Record<string, unknown>;
  created_at: string;
};

export type AdRecommendation = {
  id: string;
  organization_id: string;
  brand_id: string;
  campaign_id: string | null;
  recommendation_type: AdRecommendationType;
  title: string;
  rationale: string;
  payload: Record<string, unknown>;
  status: AdRecommendationStatus;
  dismiss_reason: string | null;
  applied_at: string | null;
  dismissed_at: string | null;
  applied_by: string | null;
  agent_run_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdsOrgSettings = {
  auto_optimise: boolean;
  max_daily_budget_change_pence: number;
  currency: string;
};
