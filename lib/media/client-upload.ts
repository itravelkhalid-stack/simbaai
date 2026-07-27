"use client";

import { createClient } from "@/lib/supabase/client";
import {
  BRAND_MEDIA_BUCKET,
  buildBrandMediaObjectPath,
  inferAssetTypeFromUpload,
  validateDirectUploadFile,
  type DirectUploadKind,
} from "@/lib/media/upload-constants";
import type { MediaAssetType } from "@/lib/types/media";

export type ClientUploadResult = {
  storagePath: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  assetType: MediaAssetType;
  filename: string;
};

/**
 * Upload a file straight from the browser to the private brand-media bucket.
 * Uses the user session + Storage RLS (org-scoped path prefix). Never hits a
 * Next.js server action body.
 */
export async function uploadBrandMediaFromBrowser(params: {
  organizationId: string;
  brandId: string;
  file: File;
  kind?: DirectUploadKind;
  reservedTag?: string;
  onProgress?: (pct: number) => void;
}): Promise<ClientUploadResult> {
  const kind = params.kind ?? "media";
  const validationError = validateDirectUploadFile(params.file, kind);
  if (validationError) throw new Error(validationError);

  const mime = params.file.type || "application/octet-stream";
  const storagePath = buildBrandMediaObjectPath({
    organizationId: params.organizationId,
    brandId: params.brandId,
    filename: params.file.name,
  });

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("You must be signed in to upload");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase is not configured");
  }

  // XHR so we can report upload progress (supabase-js upload has no progress API).
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${supabaseUrl}/storage/v1/object/${BRAND_MEDIA_BUCKET}/${storagePath}`;

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !params.onProgress) return;
      params.onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        params.onProgress?.(100);
        resolve();
        return;
      }
      let message = `Upload failed (${xhr.status})`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string };
        message = parsed.message || parsed.error || message;
      } catch {
        if (xhr.responseText) message = xhr.responseText.slice(0, 200);
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", anonKey);
    xhr.setRequestHeader("x-upsert", "false");
    if (mime) xhr.setRequestHeader("Content-Type", mime);
    xhr.send(params.file);
  });

  const { data } = supabase.storage.from(BRAND_MEDIA_BUCKET).getPublicUrl(storagePath);

  return {
    storagePath,
    publicUrl: data.publicUrl,
    mimeType: mime,
    sizeBytes: params.file.size,
    assetType: inferAssetTypeFromUpload(mime, kind, params.reservedTag),
    filename: params.file.name,
  };
}
