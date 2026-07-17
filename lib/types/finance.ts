import type { OrgPlan } from "@/lib/types/database";
import type { AdPlatform } from "@/lib/types/ads";

export type FinanceChannel =
  | AdPlatform
  | "email"
  | "seo"
  | "content"
  | "social"
  | "other"
  | "platform";

export type ExpenseSource = "auto_ads" | "auto_platform" | "manual";
export type RevenueSource = "shopify" | "woo" | "manual" | "crm";

export type Budget = {
  id: string;
  organization_id: string;
  brand_id: string;
  period_start: string;
  period_end: string;
  channel: FinanceChannel;
  planned_pence: number;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Expense = {
  id: string;
  organization_id: string;
  brand_id: string;
  expense_date: string;
  channel: FinanceChannel;
  description: string;
  amount_pence: number;
  currency: string;
  source: ExpenseSource;
  reference: string | null;
  created_at: string;
  updated_at: string;
};

export type RevenueRecord = {
  id: string;
  organization_id: string;
  brand_id: string;
  revenue_date: string;
  source: RevenueSource;
  amount_pence: number;
  currency: string;
  orders_count: number;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type BrandFinanceSettings = {
  id: string;
  organization_id: string;
  brand_id: string;
  cogs_pct: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type FinanceWeeklySummary = {
  id: string;
  organization_id: string;
  brand_id: string;
  week_start: string;
  summary_markdown: string;
  alerts: Array<{ severity: string; message: string; channel?: string }>;
  reallocation_suggestions: Array<{
    from_channel: string;
    to_channel: string;
    amount_pence: number;
    rationale: string;
  }>;
  agent_run_id: string | null;
  created_at: string;
};

export type ChannelBudgetActual = {
  channel: FinanceChannel;
  planned_pence: number;
  actual_pence: number;
  variance_pence: number;
  variance_pct: number | null;
  /** Positive = over pacing vs expected spend by day-of-period */
  pacing_pct: number | null;
  pacing_label: string;
};

export type FinanceBlendedMetrics = {
  total_spend_pence: number;
  total_revenue_pence: number;
  orders_count: number;
  blended_roas: number;
  mer: number;
  cac_pence: number | null;
  gross_margin_pence: number | null;
  gross_margin_pct: number | null;
};

export type MonthlyPnLRow = {
  month: string;
  spend_pence: number;
  revenue_pence: number;
  cogs_pence: number;
  gross_margin_pence: number;
};

export const FINANCE_CHANNEL_LABELS: Record<FinanceChannel, string> = {
  meta: "Meta",
  tiktok: "TikTok",
  google: "Google Ads",
  x: "X Ads",
  bing: "Microsoft Ads",
  email: "Email",
  seo: "SEO",
  content: "Content",
  social: "Social",
  other: "Other",
  platform: "Platform",
};

export const FINANCE_CHANNELS: FinanceChannel[] = [
  "meta",
  "tiktok",
  "google",
  "x",
  "bing",
  "email",
  "seo",
  "content",
  "social",
  "other",
  "platform",
];

export type PlanLimitKey =
  | "brands"
  | "ai_runs_month"
  | "connected_channels"
  | "team_members";

export type PlanLimits = {
  brands: number;
  ai_runs_month: number;
  connected_channels: number;
  team_members: number;
  label: string;
  monthly_price_pence: number;
};

export const PLAN_LIMITS: Record<OrgPlan, PlanLimits> = {
  free: {
    label: "Free",
    brands: 1,
    ai_runs_month: 25,
    connected_channels: 2,
    team_members: 2,
    monthly_price_pence: 0,
  },
  starter: {
    label: "Starter",
    brands: 2,
    ai_runs_month: 200,
    connected_channels: 5,
    team_members: 5,
    monthly_price_pence: 4900,
  },
  growth: {
    label: "Growth",
    brands: 5,
    ai_runs_month: 1000,
    connected_channels: 12,
    team_members: 15,
    monthly_price_pence: 14900,
  },
  agency: {
    label: "Agency",
    brands: 50,
    ai_runs_month: 10000,
    connected_channels: 100,
    team_members: 100,
    monthly_price_pence: 49900,
  },
};

export function platformToFinanceChannel(
  platform: string | null | undefined,
): FinanceChannel {
  if (
    platform === "meta" ||
    platform === "tiktok" ||
    platform === "google" ||
    platform === "x" ||
    platform === "bing"
  ) {
    return platform;
  }
  return "other";
}
