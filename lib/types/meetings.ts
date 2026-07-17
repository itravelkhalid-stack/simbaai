export type MeetingType =
  | "daily_standup"
  | "weekly_marketing"
  | "monthly_board"
  | "quarterly_board"
  | "adhoc";

export type MeetingStatus =
  | "scheduled"
  | "running"
  | "complete"
  | "failed"
  | "cancelled";

export type MeetingOwnerType = "ai" | "human";

export type MeetingActionStatus =
  | "open"
  | "in_progress"
  | "done"
  | "cancelled";

export type MeetingAgendaItem = {
  title: string;
  detail?: string;
};

export type MeetingDecision = {
  title: string;
  rationale: string;
  owner?: string;
};

export type MeetingActionItem = {
  description: string;
  owner_type: MeetingOwnerType;
  owner_label?: string;
  due_offset_days?: number;
};

export type MeetingBlocker = {
  title: string;
  detail: string;
  needs_human: boolean;
};

export type Meeting = {
  id: string;
  organization_id: string;
  brand_id: string;
  type: MeetingType;
  title: string;
  scheduled_for: string;
  status: MeetingStatus;
  agenda: MeetingAgendaItem[];
  minutes_markdown: string;
  executive_summary: string | null;
  decisions: MeetingDecision[];
  actions: MeetingActionItem[];
  context_snapshot: Record<string, unknown>;
  blockers: MeetingBlocker[];
  agent_run_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

export type MeetingAction = {
  id: string;
  organization_id: string;
  meeting_id: string;
  description: string;
  owner_type: MeetingOwnerType;
  owner_id: string | null;
  due_date: string | null;
  status: MeetingActionStatus;
  linked_task_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type MeetingComment = {
  id: string;
  organization_id: string;
  meeting_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type MeetingChatMessage = {
  id: string;
  organization_id: string;
  meeting_id: string;
  user_id: string | null;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export type MeetingsOrgSettings = {
  daily_standup_enabled: boolean;
  daily_standup_hour_utc: number;
  weekly_marketing_enabled: boolean;
  weekly_marketing_weekday: number; // 1=Mon … 7=Sun
  weekly_marketing_hour_utc: number;
  monthly_board_enabled: boolean;
  monthly_board_day: number; // 1–28
  monthly_board_hour_utc: number;
  quarterly_board_enabled: boolean;
  quarterly_board_hour_utc: number;
};

export const DEFAULT_MEETINGS_SETTINGS: MeetingsOrgSettings = {
  daily_standup_enabled: true,
  daily_standup_hour_utc: 8,
  weekly_marketing_enabled: true,
  weekly_marketing_weekday: 1,
  weekly_marketing_hour_utc: 14,
  monthly_board_enabled: true,
  monthly_board_day: 1,
  monthly_board_hour_utc: 15,
  quarterly_board_enabled: true,
  quarterly_board_hour_utc: 15,
};

export const MEETING_TYPE_LABELS: Record<MeetingType, string> = {
  daily_standup: "Daily standup",
  weekly_marketing: "Weekly marketing",
  monthly_board: "Monthly board",
  quarterly_board: "Quarterly board",
  adhoc: "Ad hoc",
};
