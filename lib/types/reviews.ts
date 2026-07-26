export type ReportType = "daily" | "weekly" | "monthly" | "quarterly";

export type ReportStatus =
  | "scheduled"
  | "generating"
  | "complete"
  | "failed"
  | "cancelled";

export type BrandKpi = {
  id: string;
  organization_id: string;
  brand_id: string;
  metric_key: string;
  label: string;
  target_value: number;
  unit: string;
  channel: string | null;
  is_north_star: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BrandReportSettings = {
  id: string;
  organization_id: string;
  brand_id: string;
  daily_enabled: boolean;
  daily_hour_utc: number;
  weekly_enabled: boolean;
  weekly_weekday: number;
  weekly_hour_utc: number;
  monthly_enabled: boolean;
  monthly_day: number;
  monthly_hour_utc: number;
  quarterly_enabled: boolean;
  quarterly_hour_utc: number;
  auto_email_enabled: boolean;
  recipients: string[];
  primary_color: string;
  secondary_color: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ReportHeadlineNumber = {
  metric: string;
  label: string;
  value: number;
  previous: number;
  delta_pct: number | null;
  unit: string;
  target?: number;
};

export type ReportChannelBreakdown = {
  channel: string;
  metrics: Record<string, number>;
  commentary: string;
};

export type ReportCampaignPerformance = {
  name: string;
  status: string;
  budget_pence: number;
  spent_pence: number;
  kpis: Array<{
    metric: string;
    target: number;
    current: number;
    unit?: string;
  }>;
  commentary: string;
};

export type ReportChartPoint = {
  date: string;
  spend_pence?: number;
  revenue_pence?: number;
  content_engagements?: number;
  email_opens?: number;
  seo_clicks?: number;
};

export type ReportContent = {
  title: string;
  summary: string;
  headline_numbers: ReportHeadlineNumber[];
  channels: ReportChannelBreakdown[];
  campaigns: ReportCampaignPerformance[];
  insights: string[];
  recommendations: string[];
  plan_retrospective?: {
    what_worked: string[];
    what_missed: string[];
    lessons: string[];
  };
  next_quarter_proposals?: string[];
  series: ReportChartPoint[];
  branding?: {
    primary_color: string;
    secondary_color: string;
    logo_url: string | null;
    brand_name: string;
  };
};

export type Report = {
  id: string;
  organization_id: string;
  brand_id: string;
  type: ReportType;
  title: string;
  period_start: string;
  period_end: string;
  status: ReportStatus;
  content: ReportContent;
  pdf_url: string | null;
  sent_to: string[];
  agent_run_id: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export const DEFAULT_BRAND_REPORT_SETTINGS: Omit<
  BrandReportSettings,
  "id" | "organization_id" | "brand_id" | "created_at" | "updated_at"
> = {
  daily_enabled: true,
  daily_hour_utc: 5,
  weekly_enabled: true,
  weekly_weekday: 1,
  weekly_hour_utc: 8,
  monthly_enabled: true,
  monthly_day: 1,
  monthly_hour_utc: 9,
  quarterly_enabled: true,
  quarterly_hour_utc: 10,
  auto_email_enabled: false,
  recipients: [],
  primary_color: "#0f766e",
  secondary_color: "#134e4a",
  logo_url: null,
};

export const SUGGESTED_KPI_KEYS = [
  { metric_key: "ad_spend", label: "Ad spend", unit: "£", channel: "ads" },
  { metric_key: "ad_revenue", label: "Attributed ad revenue", unit: "£", channel: "ads" },
  { metric_key: "roas", label: "ROAS", unit: "x", channel: "ads" },
  { metric_key: "cpa", label: "CPA", unit: "£", channel: "ads" },
  { metric_key: "email_opens", label: "Email opens", unit: "", channel: "email" },
  { metric_key: "seo_clicks", label: "SEO clicks", unit: "", channel: "seo" },
  { metric_key: "content_engagements", label: "Content engagements", unit: "", channel: "content" },
  { metric_key: "crm_revenue", label: "CRM / attributed revenue", unit: "£", channel: "crm" },
] as const;
