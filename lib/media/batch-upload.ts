"use client";

import { uploadBrandMediaFromBrowser } from "@/lib/media/client-upload";
import {
  registerAndAttachMediaToContentItem,
  registerUploadedMediaAsset,
} from "@/lib/media/actions";
import {
  validateDirectUploadFile,
  type DirectUploadKind,
} from "@/lib/media/upload-constants";

export const MEDIA_UPLOAD_CONCURRENCY = 3;

export type MediaUploadItemStatus =
  | "queued"
  | "uploading"
  | "registering"
  | "done"
  | "error";

export type MediaUploadItem = {
  id: string;
  file: File;
  status: MediaUploadItemStatus;
  progress: number;
  error?: string;
  assetId?: string;
};

export type MediaBatchSummary = {
  uploaded: number;
  failed: number;
  total: number;
};

function kindForFile(file: File, fallback: DirectUploadKind): DirectUploadKind {
  if (fallback !== "media") return fallback;
  if (file.type === "application/pdf") return "document";
  if (file.type.includes("font") || /\.(ttf|otf|woff2?)$/i.test(file.name)) {
    return "font";
  }
  return "media";
}

/** Run async work over items with a fixed concurrency cap. */
export async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const limit = Math.max(1, concurrency);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index]!, index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
}

export function createUploadItems(files: FileList | File[]): MediaUploadItem[] {
  return Array.from(files).map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    status: "queued" as const,
    progress: 0,
  }));
}

export async function uploadAndRegisterOne(params: {
  item: MediaUploadItem;
  organizationId: string;
  brandId: string;
  kind: DirectUploadKind;
  reservedTag?: string;
  type?: string;
  tags?: string;
  itemId?: string;
  replace?: boolean;
  onUpdate: (patch: Partial<MediaUploadItem>) => void;
}): Promise<boolean> {
  const { item, onUpdate } = params;
  const kind = kindForFile(item.file, params.kind);
  const validation = validateDirectUploadFile(item.file, kind);
  if (validation) {
    onUpdate({ status: "error", error: validation, progress: 0 });
    return false;
  }

  try {
    onUpdate({ status: "uploading", progress: 0, error: undefined });
    const uploaded = await uploadBrandMediaFromBrowser({
      organizationId: params.organizationId,
      brandId: params.brandId,
      file: item.file,
      kind,
      reservedTag: params.reservedTag,
      onProgress: (pct) => onUpdate({ progress: pct, status: "uploading" }),
    });

    onUpdate({ status: "registering", progress: 100 });
    const fd = new FormData();
    fd.set("brandId", params.brandId);
    fd.set("storagePath", uploaded.storagePath);
    fd.set("filename", uploaded.filename);
    fd.set("mimeType", uploaded.mimeType);
    fd.set("sizeBytes", String(uploaded.sizeBytes));
    if (params.tags) fd.set("tags", params.tags);
    if (params.reservedTag) fd.set("reservedTag", params.reservedTag);
    if (params.type) fd.set("type", params.type);
    else fd.set("type", uploaded.assetType);
    if (params.itemId) {
      fd.set("itemId", params.itemId);
      if (params.replace) fd.set("replace", "1");
    }

    const result = params.itemId
      ? await registerAndAttachMediaToContentItem({}, fd)
      : await registerUploadedMediaAsset({}, fd);

    if (result.error) {
      onUpdate({ status: "error", error: result.error });
      return false;
    }
    onUpdate({
      status: "done",
      progress: 100,
      assetId: result.assetId,
      error: undefined,
    });
    return true;
  } catch (error) {
    onUpdate({
      status: "error",
      error: error instanceof Error ? error.message : "Upload failed",
    });
    return false;
  }
}

export function summarizeItems(items: MediaUploadItem[]): MediaBatchSummary {
  const uploaded = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  return { uploaded, failed, total: items.length };
}
