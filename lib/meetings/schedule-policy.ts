import type { MeetingStatus } from "@/lib/types/meetings";

/** Statuses that consume the day's schedule slot. Failed/cancelled do not. */
export function statusBlocksScheduleSlot(status: MeetingStatus): boolean {
  return (
    status === "scheduled" ||
    status === "running" ||
    status === "complete"
  );
}
