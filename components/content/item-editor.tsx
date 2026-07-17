"use client";

import { useActionState } from "react";

import {
  addContentComment,
  approveContentItem,
  queueRepurpose,
  regenerateRejectedItem,
  rejectContentItem,
  updateContentItem,
  type ContentActionResult,
} from "@/lib/content/actions";
import { retryPublishContentItem } from "@/lib/social/actions";
import type { ContentComment, ContentItem, ComplianceFlag } from "@/lib/types/content";
import type { ComplianceCheck } from "@/lib/types/compliance";
import { ComplianceFindingsPanel } from "@/components/compliance/findings-panel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: ContentActionResult = {};

export function ContentItemEditor({
  item,
  comments,
  canWrite,
  complianceCheck,
  canOverride,
}: {
  item: ContentItem;
  comments: ContentComment[];
  canWrite: boolean;
  complianceCheck: ComplianceCheck | null;
  canOverride: boolean;
}) {
  const [saveState, saveAction, savePending] = useActionState(updateContentItem, initial);
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectContentItem,
    initial,
  );
  const [commentState, commentAction, commentPending] = useActionState(
    addContentComment,
    initial,
  );

  const flags = (item.compliance_flags ?? []) as ComplianceFlag[];
  const structured = item.structured ?? {};
  const blocked =
    complianceCheck?.status === "fail" && !complianceCheck.override_by;

  return (
    <div className="space-y-6">
      {item.publish_error ? (
        <Alert variant="destructive">
          <AlertDescription>{item.publish_error}</AlertDescription>
        </Alert>
      ) : null}

      <ComplianceFindingsPanel
        check={complianceCheck}
        showOverrideField={false}
      />

      {!complianceCheck && flags.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:bg-amber-950/30">
          <p className="text-sm font-medium">Legacy brand flags</p>
          {flags.map((flag, index) => (
            <Alert key={`${flag.code}-${index}`} variant="destructive">
              <AlertDescription>
                <span className="font-medium">{flag.code}</span>: {flag.message}
                {flag.suggestion ? ` — ${flag.suggestion}` : ""}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      <form action={saveAction} className="space-y-4 rounded-xl border p-4">
        <input type="hidden" name="itemId" value={item.id} />
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue={item.title ?? ""} disabled={!canWrite} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="copy">Copy</Label>
          <Textarea
            id="copy"
            name="copy"
            rows={8}
            defaultValue={item.copy}
            disabled={!canWrite}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="scheduledAt">Schedule</Label>
          <Input
            id="scheduledAt"
            name="scheduledAt"
            type="datetime-local"
            defaultValue={
              item.scheduled_at
                ? new Date(item.scheduled_at).toISOString().slice(0, 16)
                : ""
            }
            disabled={!canWrite}
          />
        </div>
        {saveState.error || saveState.success ? (
          <Alert variant={saveState.error ? "destructive" : "default"}>
            <AlertDescription>{saveState.error || saveState.success}</AlertDescription>
          </Alert>
        ) : null}
        {canWrite ? (
          <Button type="submit" disabled={savePending}>
            {savePending ? "Saving…" : "Save edits"}
          </Button>
        ) : null}
      </form>

      {Object.keys(structured).length > 0 ? (
        <div className="rounded-xl border p-4">
          <p className="mb-2 text-sm font-medium">Structured script / slides</p>
          <pre className="overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs">
            {JSON.stringify(structured, null, 2)}
          </pre>
        </div>
      ) : null}

      {canWrite ? (
        <div className="space-y-3">
          <form action={approveContentItem} className="space-y-2">
            <input type="hidden" name="itemId" value={item.id} />
            {blocked && canOverride ? (
              <Input
                name="overrideReason"
                placeholder="Admin override reason (min 8 chars)"
                required
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={blocked && !canOverride}>
                {blocked && !canOverride
                  ? "Blocked — needs admin override"
                  : "Approve"}
              </Button>
            </div>
          </form>
          <div className="flex flex-wrap gap-2">
            <form action={queueRepurpose}>
              <input type="hidden" name="itemId" value={item.id} />
              <Button type="submit" variant="outline">
                Repurpose to other platforms
              </Button>
            </form>
            {item.status === "rejected" ? (
              <form action={regenerateRejectedItem}>
                <input type="hidden" name="itemId" value={item.id} />
                <Button type="submit" variant="secondary">
                  Regenerate with rejection feedback
                </Button>
              </form>
            ) : null}
            {item.status === "publish_failed" || item.publish_error ? (
              <form action={retryPublishContentItem}>
                <input type="hidden" name="itemId" value={item.id} />
                <Button type="submit" variant="secondary">
                  Retry publish
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}

      {canWrite ? (
        <form action={rejectAction} className="space-y-3 rounded-xl border p-4">
          <input type="hidden" name="itemId" value={item.id} />
          <Label htmlFor="reason">Reject with reason</Label>
          <Textarea
            id="reason"
            name="reason"
            rows={3}
            placeholder="What should the agent fix on regeneration?"
            defaultValue={item.rejection_reason ?? ""}
          />
          {rejectState.error || rejectState.success ? (
            <Alert variant={rejectState.error ? "destructive" : "default"}>
              <AlertDescription>
                {rejectState.error || rejectState.success}
              </AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" variant="destructive" disabled={rejectPending}>
            {rejectPending ? "Rejecting…" : "Reject"}
          </Button>
        </form>
      ) : null}

      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Comments</p>
        <ul className="space-y-2 text-sm">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg bg-muted/40 p-2">
              <div className="flex items-center gap-2">
                {comment.resolved ? <Badge variant="secondary">resolved</Badge> : null}
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.created_at).toLocaleString()}
                </span>
              </div>
              <p>{comment.comment}</p>
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form action={commentAction} className="space-y-2">
            <input type="hidden" name="itemId" value={item.id} />
            <Textarea name="comment" rows={2} required placeholder="Leave review feedback" />
            {commentState.error ? (
              <Alert variant="destructive">
                <AlertDescription>{commentState.error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" size="sm" disabled={commentPending}>
              Comment
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
