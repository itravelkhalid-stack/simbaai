export type ComplianceIndustryPreset =
  | "general_ecommerce"
  | "financial_promotions"
  | "health_wellness"
  | "alcohol"
  | "childrens_products"
  | "custom";

export type ComplianceEntityType = "content" | "ad" | "email" | "seo_article";

export type ComplianceCheckStatus = "pass" | "warn" | "fail";

export type ComplianceFindingSeverity = "info" | "warning" | "critical";

export type ComplianceRule = {
  id: string;
  label: string;
  description: string;
  severity: ComplianceFindingSeverity;
  enabled: boolean;
};

export type ComplianceFinding = {
  severity: ComplianceFindingSeverity;
  code: string;
  message: string;
  suggestion?: string;
  rule_id?: string;
};

export type ComplianceProfile = {
  id: string;
  organization_id: string;
  brand_id: string;
  industry: ComplianceIndustryPreset;
  jurisdictions: string[];
  regulated: boolean;
  rules: ComplianceRule[];
  required_disclaimers: string[];
  banned_claims: string[];
  banned_terms: string[];
  /** Pre-cleared claim wording that does not need unsubstantiated-claim flags. */
  approved_claims: string[];
  /** Canonical T&Cs / disclaimer landing URLs. */
  terms_urls: string[];
  created_at: string;
  updated_at: string;
};

export type ComplianceCheck = {
  id: string;
  organization_id: string;
  brand_id: string;
  entity_type: ComplianceEntityType;
  entity_id: string;
  status: ComplianceCheckStatus;
  findings: ComplianceFinding[];
  checked_at: string;
  override_by: string | null;
  override_reason: string | null;
  overridden_at: string | null;
  agent_run_id: string | null;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  organization_id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export const COMPLIANCE_INDUSTRY_LABELS: Record<
  ComplianceIndustryPreset,
  string
> = {
  general_ecommerce: "General ecommerce",
  financial_promotions: "Financial promotions",
  health_wellness: "Health / wellness",
  alcohol: "Alcohol",
  childrens_products: "Children's products",
  custom: "Custom",
};

export const COMPLIANCE_ENTITY_LABELS: Record<ComplianceEntityType, string> = {
  content: "Content",
  ad: "Ad creative",
  email: "Email",
  seo_article: "SEO article",
};

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  approval: "Approval",
  publish: "Publish",
  compliance_override: "Compliance override",
  budget_change: "Budget change",
  settings_change: "Settings change",
  data_export: "Data export",
  deletion_requested: "Deletion requested",
  deletion_cancelled: "Deletion cancelled",
  deletion_completed: "Deletion completed",
};
