export type NotificationCategory =
  | "approvals"
  | "blockers"
  | "anomalies"
  | "reports"
  | "meetings"
  | "general";

export type EmailDigestPreference = "immediate" | "daily" | "off";

export type AppNotification = {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
  category: NotificationCategory;
  read_at: string | null;
  created_at: string;
};

export type NotificationPreference = {
  id: string;
  user_id: string;
  category: NotificationCategory;
  email_digest: EmailDigestPreference;
  created_at: string;
  updated_at: string;
};

export type OrgNotificationSettings = {
  organization_id: string;
  slack_webhook_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OrgFeatureFlag = {
  id: string;
  organization_id: string;
  flag_key: string;
  enabled: boolean;
  meta: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformAnnouncement = {
  id: string;
  title: string;
  body: string;
  severity: string;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingStepId =
  | "setup_brand"
  | "ai_brand_extraction"
  | "connect_social"
  | "first_research"
  | "approve_content"
  | "schedule_report";

export type OnboardingStepState = {
  done: boolean;
  completed_at?: string | null;
  manual?: boolean;
};

export type OrgOnboardingProgress = {
  organization_id: string;
  steps: Partial<Record<OnboardingStepId, OnboardingStepState>>;
  dismissed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "approvals",
  "blockers",
  "anomalies",
  "reports",
  "meetings",
  "general",
];

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  string
> = {
  approvals: "Approvals needed",
  blockers: "Blockers",
  anomalies: "Anomalies",
  reports: "Reports ready",
  meetings: "Meetings held",
  general: "General",
};

export const ONBOARDING_STEPS: Array<{
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
}> = [
  {
    id: "setup_brand",
    title: "Set up brand",
    description: "Add your brand name, voice, and guidelines.",
    href: "/brand",
  },
  {
    id: "ai_brand_extraction",
    title: "Run AI brand extraction",
    description: "Launch a brand audit research project.",
    href: "/research/new?type=brand_audit",
  },
  {
    id: "connect_social",
    title: "Connect first social account",
    description: "Link Instagram, LinkedIn, or another channel.",
    href: "/settings/connections",
  },
  {
    id: "first_research",
    title: "Run first research",
    description: "Complete any research project for the brand.",
    href: "/research/new",
  },
  {
    id: "approve_content",
    title: "Approve first content batch",
    description: "Review and approve AI-generated content.",
    href: "/content/queue",
  },
  {
    id: "schedule_report",
    title: "Schedule first report",
    description: "Turn on recurring brand reports.",
    href: "/reviews/settings",
  },
];

export const KNOWN_FEATURE_FLAGS = [
  { key: "ads_auto_optimise", label: "Ads auto-optimise" },
  { key: "content_auto_publish", label: "Content auto-publish" },
  { key: "email_auto_send", label: "Email auto-send" },
  { key: "beta_ask_data", label: "Ask-your-data beta" },
  { key: "beta_automations", label: "Automations beta" },
] as const;
