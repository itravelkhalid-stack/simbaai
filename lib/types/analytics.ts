export type AnalyticsChannel =
  | "meta"
  | "tiktok"
  | "google"
  | "x"
  | "bing"
  | "email"
  | "seo"
  | "content"
  | "social"
  | "web"
  | "crm"
  | "other"
  | "all";

export type AnalyticsDaily = {
  id: string;
  organization_id: string;
  brand_id: string;
  metric_date: string;
  channel: AnalyticsChannel;
  impressions: number;
  engagements: number;
  clicks: number;
  sessions: number;
  leads: number;
  sales: number;
  revenue_pence: number;
  spend_pence: number;
  created_at: string;
  updated_at: string;
};

export type Ga4Connection = {
  id: string;
  organization_id: string;
  brand_id: string;
  property_id: string;
  property_name: string | null;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  /** Revenue conversion events (purchase/booking). Empty = purchase-like auto. */
  conversion_event_names: string[];
  /** Engagement/intent proxy events — never used for ROAS/CPA/revenue. */
  intent_event_names: string[];
  /** Event names discovered on last sync (settings UI). */
  discovered_event_names: string[];
  created_at: string;
  updated_at: string;
};

export type AnalyticsGa4Daily = {
  id: string;
  organization_id: string;
  brand_id: string;
  metric_date: string;
  source: string;
  medium: string;
  sessions: number;
  /** Revenue conversion event counts only. */
  conversions: number;
  /** Intent/engagement proxy event counts. */
  intent_events: number;
  created_at: string;
};

export type AnalyticsAnomaly = {
  id: string;
  organization_id: string;
  brand_id: string;
  metric_date: string;
  channel: AnalyticsChannel;
  metric_key: string;
  severity: string;
  title: string;
  detail: string;
  current_value: number | null;
  baseline_value: number | null;
  delta_pct: number | null;
  ai_context: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

export type AnalyticsChatMessage = {
  id: string;
  organization_id: string;
  brand_id: string | null;
  user_id: string | null;
  role: "user" | "assistant";
  content: string;
  query_plan: Record<string, unknown> | null;
  chart: AnalyticsChartSpec | null;
  created_at: string;
};

export type AnalyticsChartSpec = {
  type: "bar" | "line" | "area";
  title: string;
  xKey: string;
  series: Array<{ key: string; label: string }>;
  data: Array<Record<string, string | number>>;
};

export type FunnelTotals = {
  impressions: number;
  clicks: number;
  leads: number;
  sales: number;
  click_rate: number | null;
  lead_rate: number | null;
  sale_rate: number | null;
};

export type ChannelMixRow = {
  channel: AnalyticsChannel;
  spend_pence: number;
  revenue_pence: number;
  clicks: number;
  sessions: number;
  roas: number | null;
};

export type CohortRow = {
  acquisition_month: string;
  revenue_pence: number;
  orders: number;
};

export const ANALYTICS_CHANNEL_LABELS: Record<AnalyticsChannel, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google Ads",
  x: "X",
  bing: "Bing",
  email: "Email",
  seo: "SEO",
  content: "Content",
  social: "Social",
  web: "Web / GA4",
  crm: "CRM",
  other: "Other",
  all: "All",
};
