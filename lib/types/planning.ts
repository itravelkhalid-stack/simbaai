export type MarketingPlanPeriod = "quarter" | "month";

export type MarketingPlanStatus =
  | "draft"
  | "pending_approval"
  | "partially_approved"
  | "approved"
  | "active"
  | "archived";

export type MarketingCampaignStatus =
  | "draft"
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type CampaignTaskModule =
  | "content"
  | "ads"
  | "email"
  | "seo"
  | "social"
  | "research"
  | "other";

export type CampaignAssigneeType = "ai" | "human";

export type CampaignTaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "in_review"
  | "done"
  | "cancelled";

export type PlanKpi = {
  metric: string;
  target: number;
  current?: number;
  unit?: string;
  source?: string;
};

export type PlanSectionKey =
  | "objectives"
  | "strategies"
  | "campaigns"
  | "channel_tactics"
  | "budget_split"
  | "kpi_targets"
  | "task_breakdown";

export const PLAN_SECTIONS: Array<{ key: PlanSectionKey; label: string }> = [
  { key: "objectives", label: "Objectives" },
  { key: "strategies", label: "Strategies" },
  { key: "campaigns", label: "Campaigns" },
  { key: "channel_tactics", label: "Channel tactics" },
  { key: "budget_split", label: "Budget split" },
  { key: "kpi_targets", label: "KPI targets" },
  { key: "task_breakdown", label: "Task breakdown" },
];

export type PlanDocumentCampaign = {
  key: string;
  name: string;
  goal: string;
  channels: string[];
  budget_pence: number;
  start_offset_days: number;
  duration_days: number;
  kpis: PlanKpi[];
  tactics: string[];
};

export type PlanDocumentTask = {
  campaign_key: string;
  title: string;
  description: string;
  module: CampaignTaskModule;
  assignee_type: CampaignAssigneeType;
  due_offset_days: number;
};

export type PlanDocument = {
  summary: string;
  objectives: Array<{ title: string; description: string; success_metric: string }>;
  strategies: Array<{ title: string; rationale: string; linked_objectives: string[] }>;
  campaigns: PlanDocumentCampaign[];
  channel_tactics: Array<{ channel: string; tactics: string[]; budget_pct: number }>;
  budget_split: Array<{ channel: string; amount_pence: number; rationale: string }>;
  kpi_targets: PlanKpi[];
  task_breakdown: PlanDocumentTask[];
};

export type SectionApprovals = Partial<Record<PlanSectionKey, boolean>>;

export type MarketingPlan = {
  id: string;
  organization_id: string;
  brand_id: string;
  title: string;
  goal_brief: string;
  period_type: MarketingPlanPeriod;
  period_start: string;
  period_end: string;
  objectives: PlanDocument["objectives"];
  document: PlanDocument;
  section_approvals: SectionApprovals;
  status: MarketingPlanStatus;
  budget_pence: number | null;
  currency: string;
  agent_run_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Campaign = {
  id: string;
  organization_id: string;
  brand_id: string;
  plan_id: string | null;
  name: string;
  goal: string | null;
  kpi: PlanKpi[];
  budget_pence: number;
  spent_pence: number;
  currency: string;
  start_date: string | null;
  end_date: string | null;
  channels: string[];
  status: MarketingCampaignStatus;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignTask = {
  id: string;
  organization_id: string;
  campaign_id: string;
  title: string;
  description: string | null;
  module: CampaignTaskModule;
  assignee_type: CampaignAssigneeType;
  assignee_id: string | null;
  status: CampaignTaskStatus;
  due_date: string | null;
  linked_entity: Record<string, unknown>;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignActivity = {
  id: string;
  organization_id: string;
  campaign_id: string;
  task_id: string | null;
  actor_type: string;
  actor_id: string | null;
  message: string;
  meta: Record<string, unknown>;
  created_at: string;
};

export type Notification = {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  category: import("@/lib/types/platform").NotificationCategory;
  read_at: string | null;
  created_at: string;
};
