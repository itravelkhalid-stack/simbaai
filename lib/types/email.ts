export type EmailSubscriberStatus =
  | "subscribed"
  | "unsubscribed"
  | "bounced"
  | "complained";

export type EmailCampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled"
  | "failed";

export type EmailFlowStatus = "draft" | "active" | "paused" | "archived";
export type EmailFlowTrigger =
  | "signup"
  | "tag_added"
  | "date"
  | "purchase"
  | "abandoned";

export type EmailEventType =
  | "queued"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "unsubscribed";

export type EmailDomainStatus =
  | "pending"
  | "verified"
  | "failed"
  | "temporary_failure"
  | "not_started";

export type EmailBlockType =
  | "heading"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "product";

export type EmailBlock = {
  id: string;
  type: EmailBlockType;
  content: Record<string, string>;
};

export type SegmentRule = {
  id: string;
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt" | "in" | "not_in" | "is_set" | "is_empty";
  value: string;
};

export type SegmentRuleGroup = {
  combinator: "and" | "or";
  rules: SegmentRule[];
};

export type EmailList = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailSubscriber = {
  id: string;
  organization_id: string;
  brand_id: string;
  list_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  custom_fields: Record<string, unknown>;
  status: EmailSubscriberStatus;
  source: string | null;
  consent_timestamp: string | null;
  consent_source: string | null;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailCampaign = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  subject: string;
  subject_variants: string[];
  ab_test: boolean;
  preheader: string | null;
  blocks: EmailBlock[];
  html_content: string;
  plain_text: string;
  status: EmailCampaignStatus;
  list_ids: string[];
  segment_id: string | null;
  sending_domain_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  stats: Record<string, number>;
  brief: string | null;
  agent_run_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailFlow = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  trigger_type: EmailFlowTrigger;
  status: EmailFlowStatus;
  strategy: Record<string, unknown>;
  list_id: string | null;
  agent_run_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailFlowStep = {
  id: string;
  organization_id: string;
  flow_id: string;
  position: number;
  delay_hours: number;
  subject: string;
  preheader: string | null;
  blocks: EmailBlock[];
  html_content: string;
  condition: Record<string, unknown>;
  goal: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailSendingDomain = {
  id: string;
  organization_id: string;
  brand_id: string;
  domain: string;
  resend_domain_id: string | null;
  status: EmailDomainStatus;
  dns_records: Array<Record<string, unknown>>;
  from_email: string | null;
  from_name: string | null;
  physical_address: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
};

export type EmailSegment = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  rules: SegmentRuleGroup;
  created_at: string;
  updated_at: string;
};
