export type ContentPlatform =
  | "instagram"
  | "facebook"
  | "tiktok"
  | "x"
  | "linkedin"
  | "youtube"
  | "pinterest";

export type ContentFormat =
  | "post"
  | "carousel"
  | "reel_script"
  | "story"
  | "thread"
  | "short_script";

export type ContentItemStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "publish_failed";

export type ContentPlanStatus =
  | "draft"
  | "proposed"
  | "partially_approved"
  | "generating"
  | "complete"
  | "cancelled";

export type ContentPlanSlotStatus =
  | "proposed"
  | "approved"
  | "rejected"
  | "generated"
  | "failed";

export type ComplianceFlag = {
  severity: "warning" | "critical";
  code: string;
  message: string;
  suggestion?: string;
};

export type ContentPillar = {
  id: string;
  organization_id: string;
  brand_id: string;
  name: string;
  description: string | null;
  target_pct: number;
  created_at: string;
  updated_at: string;
};

export type ContentItem = {
  id: string;
  organization_id: string;
  brand_id: string;
  pillar_id: string | null;
  platform: ContentPlatform;
  format: ContentFormat;
  status: ContentItemStatus;
  title: string | null;
  copy: string;
  hashtags: string[];
  media_urls: string[];
  structured: Record<string, unknown>;
  compliance_flags: ComplianceFlag[];
  rejection_reason: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  ai_generated: boolean;
  campaign_id: string | null;
  plan_id: string | null;
  variant_group_id: string | null;
  source_item_id: string | null;
  agent_run_id: string | null;
  publish_error: string | null;
  publish_attempts: number;
  last_publish_attempt_at: string | null;
  /** e.g. "Approved by CMO (Simba)" */
  approval_label: string | null;
  approved_at: string | null;
  /** Dashboard note when CMO parks for human */
  cmo_note: string | null;
  cmo_regeneration_attempted: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentComment = {
  id: string;
  organization_id: string;
  item_id: string;
  user_id: string;
  comment: string;
  resolved: boolean;
  created_at: string;
};

export type ContentPlan = {
  id: string;
  organization_id: string;
  brand_id: string;
  title: string;
  status: ContentPlanStatus;
  start_date: string;
  end_date: string;
  brief: Record<string, unknown>;
  agent_run_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContentPlanSlot = {
  id: string;
  organization_id: string;
  plan_id: string;
  pillar_id: string | null;
  platform: ContentPlatform;
  format: ContentFormat;
  topic: string;
  scheduled_at: string | null;
  status: ContentPlanSlotStatus;
  content_item_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export const PLATFORM_LABELS: Record<ContentPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  pinterest: "Pinterest",
};

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  post: "Post",
  carousel: "Carousel",
  reel_script: "Reel script",
  story: "Story",
  thread: "Thread",
  short_script: "Short script",
};

export const STATUS_LABELS: Record<ContentItemStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
  publish_failed: "Publish failed",
};

export const PLATFORM_COLORS: Record<ContentPlatform, string> = {
  instagram: "bg-danger-soft text-danger",
  facebook: "bg-brand-soft text-primary",
  tiktok: "bg-muted text-ink",
  x: "bg-accent text-primary",
  linkedin: "bg-brand-soft text-primary",
  youtube: "bg-danger-soft text-danger",
  pinterest: "bg-warning-soft text-ink",
};

export const STATUS_COLORS: Record<ContentItemStatus, string> = {
  draft: "border-border",
  pending_approval: "border-warning",
  approved: "border-success",
  scheduled: "border-warning",
  published: "border-brand",
  rejected: "border-danger",
  publish_failed: "border-danger",
};
