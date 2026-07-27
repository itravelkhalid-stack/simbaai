"use client";

import { useState } from "react";

import { uploadBrandMediaFromBrowser } from "@/lib/media/client-upload";
import {
  registerAndAttachMediaToContentItem,
  registerUploadedMediaAsset,
  type MediaActionResult,
} from "@/lib/media/actions";
import {
  MAX_DIRECT_UPLOAD_BYTES,
  validateDirectUploadFile,
  type DirectUploadKind,
} from "@/lib/media/upload-constants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function formatMb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))}`;
}

export function DirectMediaUpload({
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
  disabled,
  onComplete,
}: {
  organizationId: string;
  brandId: string;
  kind?: DirectUploadKind;
  reservedTag?: string;
  type?: string;
  tags?: string;
  accept?: string;
  label?: string;
  hint?: string;
  /** When set, register then attach to this content item. */
  itemId?: string;
  replace?: boolean;
  disabled?: boolean;
  onComplete?: (result: MediaActionResult) => void;
}) {
  const [message, setMessage] = useState<MediaActionResult>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, setPending] = useState(false);

  async function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    setMessage({});
    const validation = validateDirectUploadFile(file, kind);
    if (validation) {
      setMessage({ error: validation });
      onComplete?.({ error: validation });
      return;
    }

    setPending(true);
    setProgress(0);
    try {
      const uploaded = await uploadBrandMediaFromBrowser({
        organizationId,
        brandId,
        file,
        kind,
        reservedTag,
        onProgress: setProgress,
      });

      const fd = new FormData();
      fd.set("brandId", brandId);
      fd.set("storagePath", uploaded.storagePath);
      fd.set("filename", uploaded.filename);
      fd.set("mimeType", uploaded.mimeType);
      fd.set("sizeBytes", String(uploaded.sizeBytes));
      if (tags) fd.set("tags", tags);
      if (reservedTag) fd.set("reservedTag", reservedTag);
      if (type) fd.set("type", type);
      else fd.set("type", uploaded.assetType);
      if (itemId) {
        fd.set("itemId", itemId);
        if (replace) fd.set("replace", "1");
      }

      const result = itemId
        ? await registerAndAttachMediaToContentItem({}, fd)
        : await registerUploadedMediaAsset({}, fd);

      setMessage(result);
      onComplete?.(result);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Upload failed";
      const result = { error: text };
      setMessage(result);
      onComplete?.(result);
    } finally {
      setPending(false);
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="file"
        accept={accept}
        disabled={disabled || pending}
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Max {formatMb(MAX_DIRECT_UPLOAD_BYTES)}MB. Uploads go directly to
          storage (not through the app server).
        </p>
      )}
      {progress !== null ? (
        <div className="space-y-1">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {progress < 100 ? `Uploading… ${progress}%` : "Saving…"}
          </p>
        </div>
      ) : null}
      {message.error || message.success ? (
        <Alert variant={message.error ? "destructive" : "default"}>
          <AlertDescription>
            {message.error ?? message.success}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
