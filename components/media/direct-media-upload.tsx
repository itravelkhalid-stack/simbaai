"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  createUploadItems,
  mapPool,
  MEDIA_UPLOAD_CONCURRENCY,
  uploadAndRegisterOne,
  type MediaBatchSummary,
  type MediaUploadItem,
} from "@/lib/media/batch-upload";
import type { MediaActionResult } from "@/lib/media/actions";
import {
  MAX_DIRECT_UPLOAD_BYTES,
  type DirectUploadKind,
} from "@/lib/media/upload-constants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))}`;
}

export type DirectMediaUploadHandle = {
  enqueueFiles: (files: FileList | File[]) => void;
};

export const DirectMediaUpload = forwardRef<
  DirectMediaUploadHandle,
  {
    organizationId: string;
    brandId: string;
    kind?: DirectUploadKind;
    reservedTag?: string;
    type?: string;
    tags?: string;
    accept?: string;
    label?: string;
    hint?: string;
    itemId?: string;
    replace?: boolean;
    multiple?: boolean;
    disabled?: boolean;
    onComplete?: (result: MediaActionResult) => void;
    onBatchComplete?: (summary: MediaBatchSummary) => void;
  }
>(function DirectMediaUpload(
  {
    organizationId,
    brandId,
    kind = "media",
    reservedTag,
    type,
    tags,
    accept = "image/*,video/*",
    label = "Upload",
    hint,
    itemId,
    replace,
    multiple = true,
    disabled,
    onComplete,
    onBatchComplete,
  },
  ref,
) {
  const [items, setItems] = useState<MediaUploadItem[]>([]);
  const [pending, setPending] = useState(false);
  const [summary, setSummary] = useState<MediaBatchSummary | null>(null);
  const itemsRef = useRef<MediaUploadItem[]>([]);
  const runIdRef = useRef(0);

  const syncItems = useCallback((next: MediaUploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patchItem = useCallback(
    (id: string, patch: Partial<MediaUploadItem>) => {
      const next = itemsRef.current.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      );
      syncItems(next);
    },
    [syncItems],
  );

  const finishBatch = useCallback(
    (batchIds: Set<string>) => {
      const latest = itemsRef.current;
      const scoped = latest.filter((i) => batchIds.has(i.id));
      const uploaded = scoped.filter((i) => i.status === "done").length;
      const failed = scoped.filter((i) => i.status === "error").length;
      const stats: MediaBatchSummary = {
        uploaded,
        failed,
        total: scoped.length,
      };
      setSummary(stats);
      setPending(false);
      onBatchComplete?.(stats);

      if (failed === 0 && uploaded > 0) {
        onComplete?.({
          success:
            uploaded === 1 ? "Uploaded" : `Uploaded ${uploaded} files`,
        });
      } else if (uploaded === 0 && failed > 0) {
        onComplete?.({
          error:
            failed === 1
              ? scoped.find((i) => i.status === "error")?.error ??
                "Upload failed"
              : `${failed} uploads failed`,
        });
      } else if (uploaded > 0) {
        onComplete?.({
          success: `${uploaded} uploaded, ${failed} failed`,
        });
      }
    },
    [onBatchComplete, onComplete],
  );

  const runBatch = useCallback(
    async (batch: MediaUploadItem[], mode: "new" | "retry") => {
      const runId = ++runIdRef.current;
      setPending(true);
      setSummary(null);

      const work = multiple ? batch : batch.slice(0, 1);
      const batchIds = new Set(work.map((w) => w.id));

      if (mode === "new") {
        syncItems(work);
      } else {
        const byId = new Map(work.map((b) => [b.id, b]));
        syncItems(
          itemsRef.current.map((row) => byId.get(row.id) ?? row),
        );
      }

      await mapPool(work, MEDIA_UPLOAD_CONCURRENCY, async (item) => {
        if (runId !== runIdRef.current) return;
        await uploadAndRegisterOne({
          item,
          organizationId,
          brandId,
          kind,
          reservedTag,
          type,
          tags,
          itemId,
          replace: Boolean(replace) && !multiple,
          onUpdate: (patch) => {
            if (runId !== runIdRef.current) return;
            patchItem(item.id, patch);
          },
        });
      });

      if (runId !== runIdRef.current) return;
      finishBatch(batchIds);
    },
    [
      brandId,
      finishBatch,
      itemId,
      kind,
      multiple,
      organizationId,
      patchItem,
      replace,
      reservedTag,
      syncItems,
      tags,
      type,
    ],
  );

  const enqueueFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      const batch = createUploadItems(multiple ? list : list.slice(0, 1));
      void runBatch(batch, "new");
    },
    [multiple, runBatch],
  );

  useImperativeHandle(ref, () => ({ enqueueFiles }), [enqueueFiles]);

  function retryFailed() {
    const failed = itemsRef.current
      .filter((i) => i.status === "error")
      .map((i) => ({
        ...i,
        status: "queued" as const,
        progress: 0,
        error: undefined,
      }));
    if (!failed.length) return;
    void runBatch(failed, "retry");
  }

  const busy = pending || disabled;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{label}</Label>
        <Input
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.length) enqueueFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Max {formatMb(MAX_DIRECT_UPLOAD_BYTES)}MB each.{" "}
            {multiple ? "Select multiple files or drag and drop. " : ""}
            Uploads go directly to storage (not through the app server).
          </p>
        )}
      </div>

      {items.length > 0 ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-2">
          {items.map((item) => (
            <li key={item.id} className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{item.file.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {item.status === "queued" && "Queued"}
                  {item.status === "uploading" && `${item.progress}%`}
                  {item.status === "registering" && "Saving…"}
                  {item.status === "done" && "Done"}
                  {item.status === "error" && "Failed"}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-[width] duration-150 ${
                    item.status === "error"
                      ? "bg-destructive"
                      : item.status === "done"
                        ? "bg-primary"
                        : "bg-primary/80"
                  }`}
                  style={{
                    width: `${
                      item.status === "done" || item.status === "error"
                        ? 100
                        : item.progress
                    }%`,
                  }}
                />
              </div>
              {item.error ? (
                <p className="text-destructive">{item.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {summary && !pending ? (
        <Alert variant={summary.failed > 0 ? "destructive" : "default"}>
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>
              {summary.uploaded} uploaded
              {summary.failed > 0 ? `, ${summary.failed} failed — retry` : ""}
            </span>
            {summary.failed > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={retryFailed}
                disabled={busy}
              >
                Retry failed
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
});
