/**
 * Map workflow statuses to Simba AI badge variants.
 * complete/active → success | pending/scheduled → warning |
 * failed/expired → danger | draft/paused → neutral | AI → ai
 */
export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "ai";

const STATUS_TONE: Record<string, StatusTone> = {
  complete: "success",
  completed: "success",
  active: "success",
  published: "success",
  approved: "success",
  running: "success",
  pending: "warning",
  pending_approval: "warning",
  scheduled: "warning",
  queued: "warning",
  failed: "danger",
  expired: "danger",
  rejected: "danger",
  publish_failed: "danger",
  draft: "neutral",
  paused: "neutral",
  cancelled: "neutral",
  ai: "ai",
  generated: "ai",
};

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status.toLowerCase()] ?? "neutral";
}
