"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  ApprovalCardShell,
  PlatformChip,
  SeverityCallout,
  SimbaBadge,
} from "@/components/approvals/approval-card";
import { EmptyState } from "@/components/brand/empty-state";
import { MediaLibraryPicker } from "@/components/content/media-library-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  approveContentItem,
  rejectContentItem,
  updateContentItem,
  type ContentActionResult,
} from "@/lib/content/actions";
import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  type ComplianceFlag,
  type ContentItem,
} from "@/lib/types/content";
import type { MediaAsset } from "@/lib/types/media";
import { statusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const initial: ContentActionResult = {};

function QueueItemCard({
  item,
  libraryAssets,
  canWrite,
  organizationId,
}: {
  item: ContentItem;
  libraryAssets: MediaAsset[];
  canWrite: boolean;
  organizationId: string;
}) {
  const [saveState, saveAction, savePending] = useActionState(
    updateContentItem,
    initial,
  );
  const [rejectState, rejectAction, rejectPending] = useActionState(
    rejectContentItem,
    initial,
  );

  const flags = (item.compliance_flags ?? []) as ComplianceFlag[];
  const thumb = item.media_urls?.[0];
  const pending = item.status === "pending_approval";
  const needsImage = !thumb;

  return (
    <ApprovalCardShell>
      <div className="flex flex-wrap items-start gap-4">
        <div className="size-20 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-border">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-xs text-ink-soft">
              Needs image
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <PlatformChip
              platform={item.platform}
              label={PLATFORM_LABELS[item.platform]}
            />
            <Badge variant="neutral">{FORMAT_LABELS[item.format]}</Badge>
            <Badge variant={statusTone(item.status)}>
              {STATUS_LABELS[item.status]}
            </Badge>
            <SimbaBadge />
            {needsImage ? (
              <Badge variant="outline">Needs image</Badge>
            ) : null}
            {item.approval_label ? (
              <Badge variant="outline">{item.approval_label}</Badge>
            ) : null}
          </div>
          {item.cmo_note ? (
            <Alert>
              <AlertDescription>
                <span className="font-medium">CMO note: </span>
                {item.cmo_note}
              </AlertDescription>
            </Alert>
          ) : null}
          <div>
            <Link
              href={`/content/${item.id}`}
              className="font-heading text-lg font-semibold text-ink hover:text-primary"
            >
              {item.title || "Untitled draft"}
            </Link>
            <p className="mt-1 line-clamp-3 text-sm text-ink-soft">{item.copy}</p>
          </div>
          {flags.length > 0 ? (
            <div className="space-y-2">
              {flags.map((f, i) => (
                <SeverityCallout
                  key={`${f.code}-${i}`}
                  severity={f.severity}
                  title={f.code}
                  message={f.message}
                />
              ))}
            </div>
          ) : (
            <p className="text-xs font-medium text-primary">Compliance clean</p>
          )}
          {pending && canWrite ? (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-ink-soft">
                  {needsImage
                    ? "Pick a library image before approving visual posts."
                    : "Swap suggested image from the library."}
                </p>
                <MediaLibraryPicker
                  itemId={item.id}
                  brandId={item.brand_id}
                  organizationId={organizationId}
                  assets={libraryAssets}
                  canWrite={canWrite}
                  triggerLabel={needsImage ? "Choose image" : "Swap image"}
                  replace
                  compact
                />
              </div>
              <form action={saveAction} className="space-y-2">
                <input type="hidden" name="itemId" value={item.id} />
                <Textarea
                  name="copy"
                  defaultValue={item.copy}
                  rows={3}
                  className="text-sm"
                />
                {saveState.error || saveState.success ? (
                  <Alert variant={saveState.error ? "destructive" : "default"}>
                    <AlertDescription>
                      {saveState.error || saveState.success}
                    </AlertDescription>
                  </Alert>
                ) : null}
                <Button type="submit" size="sm" variant="outline" disabled={savePending}>
                  {savePending ? "Saving…" : "Save edit"}
                </Button>
              </form>
              <div className="flex flex-wrap items-end gap-2">
                <form action={approveContentItem}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <Button type="submit">Approve</Button>
                </form>
                <form action={rejectAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="itemId" value={item.id} />
                  <Input
                    name="reason"
                    placeholder="Reject reason"
                    className="w-52"
                    required
                  />
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={rejectPending}
                  >
                    {rejectPending ? "Rejecting…" : "Reject"}
                  </Button>
                </form>
                <Link
                  href={`/content/${item.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Open full editor
                </Link>
              </div>
              {rejectState.error || rejectState.success ? (
                <Alert variant={rejectState.error ? "destructive" : "default"}>
                  <AlertDescription>
                    {rejectState.error || rejectState.success}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <Link
              href={`/content/${item.id}`}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Open
            </Link>
          )}
        </div>
      </div>
    </ApprovalCardShell>
  );
}

export function ReviewQueueCards({
  items,
  libraryByBrand = {},
  canWrite = false,
  organizationId,
}: {
  items: ContentItem[];
  libraryByBrand?: Record<string, MediaAsset[]>;
  canWrite?: boolean;
  organizationId: string;
}) {
  if (!items.length) {
    return (
      <EmptyState
        title="Queue is empty"
        description="Approved drafts and new AI content will land here for review."
        actionLabel="Generate content"
        actionHref="/content/generate"
      />
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id}>
          <QueueItemCard
            item={item}
            libraryAssets={libraryByBrand[item.brand_id] ?? []}
            canWrite={canWrite}
            organizationId={organizationId}
          />
        </li>
      ))}
    </ul>
  );
}
