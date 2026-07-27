import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  MEETING_TYPE_LABELS,
  type Meeting,
  type MeetingStatus,
} from "@/lib/types/meetings";
import { statusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<MeetingStatus, string> = {
  scheduled: "Scheduled",
  running: "Running",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function MeetingFeedCard({
  meeting,
  brandName,
}: {
  meeting: Meeting;
  brandName: string;
}) {
  const tone = statusTone(meeting.status);
  const hasBlockers = (meeting.blockers ?? []).some((b) => b.needs_human);

  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className={cn(
        "block rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border transition-colors hover:ring-brand/40",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="ai">{MEETING_TYPE_LABELS[meeting.type]}</Badge>
            <Badge variant={tone}>{STATUS_LABEL[meeting.status]}</Badge>
            {meeting.escalation_flagged ? (
              <Badge variant="danger">Escalation</Badge>
            ) : null}
            {hasBlockers ? <Badge variant="warning">Needs human</Badge> : null}
          </div>
          <p className="font-heading text-lg font-semibold text-ink">
            {meeting.title}
          </p>
          <p className="text-sm text-ink-soft">
            {brandName} ·{" "}
            {new Date(meeting.scheduled_for).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
      </div>
    </Link>
  );
}
