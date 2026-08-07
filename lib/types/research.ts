export type ResearchProjectType =
  | "brand_audit"
  | "competitor"
  | "market"
  | "keyword"
  | "audience"
  | "trend";

export type ResearchProjectStatus =
  | "draft"
  | "queued"
  | "running"
  | "complete"
  | "failed";

export type Brand = {
  id: string;
  organization_id: string;
  name: string;
  website: string | null;
  positioning: string | null;
  brand_voice: string | null;
  target_audience: string | null;
  guidelines: Record<string, unknown>;
  social_handles: Record<string, unknown>;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font_heading: string | null;
  font_body: string | null;
  tagline: string | null;
  products_summary: string | null;
  is_primary: boolean;
  autonomy_mode: "approval" | "autonomous";
  channel_modes: Record<string, unknown>;
  agent_activity_paused: boolean;
  autonomy_min_roas: number;
  autonomy_max_cpa_pence: number;
  /** Empty = derive from connected social/ad accounts. */
  enabled_channels: string[];
  /** Organic cadence quotas; empty uses platform defaults. */
  content_cadence: Record<string, unknown>;
  /** Human-set monthly ad budget (minor units). Null = budget loop off. */
  monthly_ad_budget_pence: number | null;
  monthly_ad_budget_currency: string;
  created_at: string;
  updated_at: string;
};

export type BrandProduct = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  category: string | null;
  price_pence: number | null;
  currency: string;
  url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type BrandAudience = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  demographics: Record<string, unknown>;
  psychographics: Record<string, unknown>;
  channel_behaviour: Record<string, unknown>;
  messaging_angles: string[];
  source_research_project_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ResearchProject = {
  id: string;
  organization_id: string;
  brand_id: string;
  type: ResearchProjectType;
  status: ResearchProjectStatus;
  title: string;
  brief: Record<string, unknown>;
  latest_agent_run_id: string | null;
  refreshed_from_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ResearchDocument = {
  id: string;
  organization_id: string;
  project_id: string;
  section: string;
  content: string;
  sources: Array<{ title: string; url: string; note?: string }>;
  confidence: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Competitor = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  website: string | null;
  social_handles: Record<string, unknown>;
  positioning: string | null;
  strengths: string[];
  weaknesses: string[];
  pricing_notes: string | null;
  content_strategy: string | null;
  ad_presence: string | null;
  seo_strengths: string | null;
  social_performance: string | null;
  comparison: Record<string, unknown>;
  source_research_project_id: string | null;
  last_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentRunLog = {
  at: string;
  message: string;
  level?: "info" | "warn" | "error";
};

export const RESEARCH_TYPE_LABELS: Record<ResearchProjectType, string> = {
  brand_audit: "Brand Audit",
  competitor: "Competitor Research",
  market: "Market Research",
  keyword: "Keyword Research",
  audience: "Audience Research",
  trend: "Trend Research",
};

export function researchFreshness(completedAt: string | null): {
  label: string;
  tone: "fresh" | "aging" | "stale" | "unknown";
} {
  if (!completedAt) return { label: "Not complete", tone: "unknown" };
  const days =
    (Date.now() - new Date(completedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (days <= 14) return { label: "Fresh", tone: "fresh" };
  if (days <= 45) return { label: "Aging", tone: "aging" };
  return { label: "Stale", tone: "stale" };
}
