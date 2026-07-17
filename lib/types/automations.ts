export type AutomationStatus = "draft" | "active" | "paused" | "archived";
export type AutomationRunStatus = "running" | "success" | "failed" | "skipped";

export type AutomationTriggerType =
  | "schedule"
  | "metric_threshold"
  | "event"
  | "webhook";

export type AutomationEventName =
  | "subscriber.created"
  | "deal.won"
  | "post.published"
  | "report.ready"
  | "contact.tagged";

export type ScheduleTrigger = {
  type: "schedule";
  frequency: "hourly" | "daily" | "weekly";
  at_hour?: number;
  at_minute?: number;
  weekday?: number; // 0=Sun
};

export type MetricThresholdTrigger = {
  type: "metric_threshold";
  metric: "roas" | "spend_pence" | "ctr" | "sessions" | "scheduled_posts";
  op: "<" | "<=" | ">" | ">=";
  value: number;
  days: number;
  channel?: string;
};

export type EventTrigger = {
  type: "event";
  event: AutomationEventName;
  tag?: string; // for contact.tagged
};

export type WebhookTrigger = {
  type: "webhook";
};

export type AutomationTrigger =
  | ScheduleTrigger
  | MetricThresholdTrigger
  | EventTrigger
  | WebhookTrigger;

export type ConditionRule = {
  field: string;
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "exists";
  value?: string | number | boolean;
};

export type ConditionGroup = {
  logic: "and" | "or";
  rules: ConditionRule[];
};

export type AutomationActionType =
  | "run_agent"
  | "notify"
  | "create_task"
  | "pause_ad_campaign"
  | "resume_ad_campaign"
  | "add_contact_tag"
  | "send_email_campaign"
  | "outbound_webhook";

export type AutomationAction = {
  type: AutomationActionType;
  // run_agent
  agent?: "content_batch" | "email_draft" | "research_refresh";
  brief?: string;
  // notify
  channels?: Array<"in_app" | "email" | "slack">;
  title?: string;
  body?: string;
  // create_task
  task_title?: string;
  task_description?: string;
  task_module?: string;
  // ads
  campaign_id?: string;
  use_trigger_campaign?: boolean;
  // crm
  tag?: string;
  use_trigger_contact?: boolean;
  // email
  email_campaign_id?: string;
  segment_id?: string;
  // webhook
  url?: string;
  // budget estimate for safety (pence) when resuming/activating spend
  budget_impact_pence?: number;
};

export type Automation = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  trigger: AutomationTrigger;
  conditions: ConditionGroup[];
  actions: AutomationAction[];
  webhook_secret: string | null;
  last_run_at: string | null;
  run_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRun = {
  id: string;
  organization_id: string;
  automation_id: string;
  status: AutomationRunStatus;
  trigger_data: Record<string, unknown>;
  actions_executed: Array<Record<string, unknown>>;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
};

export type BrandAutomationSettings = {
  id: string;
  organization_id: string;
  brand_id: string;
  auto_publish_channels: string[];
  daily_budget_action_cap_pence: number;
  slack_webhook_url: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationRecipe = {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  conditions: ConditionGroup[];
  actions: AutomationAction[];
};

export const AUTOMATION_STATUS_LABELS: Record<AutomationStatus, string> = {
  draft: "Draft",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

export const TRIGGER_TYPE_LABELS: Record<AutomationTriggerType, string> = {
  schedule: "Schedule",
  metric_threshold: "Metric threshold",
  event: "Event",
  webhook: "Webhook in",
};

export const ACTION_TYPE_LABELS: Record<AutomationActionType, string> = {
  run_agent: "Run AI agent",
  notify: "Send notification",
  create_task: "Create task",
  pause_ad_campaign: "Pause ad campaign",
  resume_ad_campaign: "Resume ad campaign",
  add_contact_tag: "Add contact tag",
  send_email_campaign: "Send email campaign",
  outbound_webhook: "Outbound webhook",
};
