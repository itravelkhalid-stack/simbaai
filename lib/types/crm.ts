export type CrmLifecycleStage =
  | "subscriber"
  | "lead"
  | "mql"
  | "sql"
  | "customer"
  | "repeat"
  | "churned";

export type CrmActivityType =
  | "note"
  | "email"
  | "call"
  | "meeting"
  | "task"
  | "status_change";

export type CrmPipelineStage = {
  id: string;
  name: string;
  probability?: number;
};

export type CrmPipeline = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  stages: CrmPipelineStage[];
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CrmContact = {
  id: string;
  organization_id: string;
  brand_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  lifecycle_stage: CrmLifecycleStage;
  owner_id: string | null;
  total_revenue_pence: number;
  lead_score: number | null;
  lead_score_reasoning: string | null;
  lead_scored_at: string | null;
  email_subscriber_id: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmDeal = {
  id: string;
  organization_id: string;
  brand_id: string;
  contact_id: string;
  pipeline_id: string;
  name: string;
  value_pence: number;
  stage: string;
  expected_close: string | null;
  won_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
  sort_order: number;
  stalled_since: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmActivity = {
  id: string;
  organization_id: string;
  contact_id: string;
  deal_id: string | null;
  type: CrmActivityType;
  content: string;
  user_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type CrmOrder = {
  id: string;
  organization_id: string;
  brand_id: string;
  contact_id: string;
  provider: "shopify" | "woocommerce" | "manual" | "form";
  external_id: string;
  order_total_pence: number;
  currency: string;
  ordered_at: string;
  raw: Record<string, unknown>;
  created_at: string;
};

export type CrmPipelineReview = {
  id: string;
  organization_id: string;
  brand_id: string;
  week_start: string;
  summary_markdown: string;
  stalled_deal_ids: string[];
  next_actions: Array<{ deal_id?: string; action: string }>;
  agent_run_id: string | null;
  created_at: string;
};

export const LIFECYCLE_STAGES: CrmLifecycleStage[] = [
  "subscriber",
  "lead",
  "mql",
  "sql",
  "customer",
  "repeat",
  "churned",
];

export const LIFECYCLE_LABELS: Record<CrmLifecycleStage, string> = {
  subscriber: "Subscriber",
  lead: "Lead",
  mql: "MQL",
  sql: "SQL",
  customer: "Customer",
  repeat: "Repeat",
  churned: "Churned",
};

export const DEFAULT_PIPELINE_STAGES: CrmPipelineStage[] = [
  { id: "discovery", name: "Discovery", probability: 10 },
  { id: "qualification", name: "Qualification", probability: 25 },
  { id: "proposal", name: "Proposal", probability: 50 },
  { id: "negotiation", name: "Negotiation", probability: 75 },
  { id: "closed_won", name: "Closed won", probability: 100 },
  { id: "closed_lost", name: "Closed lost", probability: 0 },
];

export type FunnelStageStat = {
  stage: CrmLifecycleStage;
  count: number;
  previous_count: number;
  conversion_from_prev_pct: number | null;
  previous_conversion_pct: number | null;
};

export const ACTIVITY_TYPE_LABELS: Record<CrmActivityType, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  task: "Task",
  status_change: "Status change",
};
