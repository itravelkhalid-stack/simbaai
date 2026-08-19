export type SeoKeywordIntent =
  | "informational"
  | "navigational"
  | "commercial"
  | "transactional";

export type SeoKeywordPriority = "low" | "medium" | "high" | "critical";

export type SeoPageStatus =
  | "pending"
  | "ok"
  | "needs_work"
  | "critical"
  | "ignored";

export type SeoBriefStatus =
  | "draft"
  | "ready"
  | "in_progress"
  | "completed"
  | "archived";

export type SeoArticleStatus =
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "archived";

export type SeoIssueSeverity = "low" | "medium" | "high" | "critical";

export type SeoPageIssue = {
  code: string;
  severity: SeoIssueSeverity;
  message: string;
  evidence?: string;
};

export type SeoKeywordMapCluster = {
  id: string;
  name: string;
  keywords: string[];
};

export type SeoKeywordMapPillar = {
  id: string;
  name: string;
  primary_keyword: string;
  clusters: SeoKeywordMapCluster[];
};

export type SeoKeywordMap = {
  pillars: SeoKeywordMapPillar[];
  notes?: string;
};

export type SeoProject = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  domain: string;
  gsc_connected: boolean;
  gsc_site_url: string | null;
  gsc_access_token_encrypted: string | null;
  gsc_refresh_token_encrypted: string | null;
  gsc_token_expires_at: string | null;
  keyword_map: SeoKeywordMap;
  last_audit_at: string | null;
  last_gsc_sync_at: string | null;
  gsc_last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SeoKeyword = {
  id: string;
  organization_id: string;
  project_id: string;
  keyword: string;
  intent: SeoKeywordIntent;
  volume: number | null;
  difficulty: number | null;
  current_position: number | null;
  previous_position: number | null;
  target_url: string | null;
  priority: SeoKeywordPriority;
  pillar: string | null;
  cluster: string | null;
  tracked: boolean;
  created_at: string;
  updated_at: string;
};

export type SeoPage = {
  id: string;
  organization_id: string;
  project_id: string;
  url: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  status: SeoPageStatus;
  issues: SeoPageIssue[];
  word_count: number | null;
  has_schema: boolean;
  missing_alt_count: number;
  broken_link_count: number;
  pagespeed_score: number | null;
  pagespeed_raw: Record<string, unknown>;
  last_audited_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SeoContentBrief = {
  id: string;
  organization_id: string;
  project_id: string;
  keyword_id: string;
  title: string;
  brief_markdown: string;
  outline: string[];
  entities: string[];
  internal_links: string[];
  target_word_count: number;
  search_intent: string | null;
  status: SeoBriefStatus;
  agent_run_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SeoArticleChecklist = {
  score: number;
  checks: Array<{
    id: string;
    label: string;
    passed: boolean;
    detail?: string;
  }>;
};

export type SeoArticle = {
  id: string;
  organization_id: string;
  project_id: string;
  brief_id: string;
  title: string;
  content_markdown: string;
  status: SeoArticleStatus;
  published_url: string | null;
  checklist_score: number | null;
  checklist: SeoArticleChecklist | Record<string, unknown>;
  agent_run_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SeoGscDaily = {
  id: string;
  organization_id: string;
  project_id: string;
  metric_date: string;
  query: string;
  page: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  created_at: string;
};

export type SeoWeeklySummary = {
  id: string;
  organization_id: string;
  project_id: string;
  week_start: string;
  week_end: string;
  summary_markdown: string;
  highlights: string[];
  metrics: Record<string, unknown>;
  agent_run_id: string | null;
  created_at: string;
};
