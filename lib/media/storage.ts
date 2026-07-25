import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MediaAssetType } from "@/lib/types/media";

export const BRAND_MEDIA_BUCKET = "brand-media";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_FONT_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const DOC_TYPES = new Set(["application/pdf"]);

const FONT_TYPES = new Set([
  "font/ttf",
  "font/otf",
  "font/woff",
  "font/woff2",
  "application/font-sfnt",
  "application/x-font-ttf",
  "application/x-font-otf",
  "application/font-woff",
  "application/font-woff2",
]);

const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export function inferMediaAssetType(mime: string, reservedTag?: string): MediaAssetType {
  if (reservedTag?.startsWith("logo-")) return "logo";
  if (reservedTag?.startsWith("font-")) return "font";
  if (reservedTag === "guidelines-doc") return "document";
  if (IMAGE_TYPES.has(mime)) return reservedTag?.startsWith("logo") ? "logo" : "image";
  if (DOC_TYPES.has(mime)) return "document";
  if (FONT_TYPES.has(mime) || mime.includes("font")) return "font";
  if (VIDEO_TYPES.has(mime)) return "video";
  return "image";
}

function extForMime(mime: string, filename: string): string {
  const fromName = filename.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "image/svg+xml") return "svg";
  if (mime === "application/pdf") return "pdf";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime.includes("woff2")) return "woff2";
  if (mime.includes("woff")) return "woff";
  if (mime.includes("otf")) return "otf";
  if (mime.includes("ttf") || mime.includes("sfnt")) return "ttf";
  return "bin";
}

function assertAllowed(file: File, assetType: MediaAssetType) {
  const mime = file.type || "application/octet-stream";
  if (assetType === "image" || assetType === "logo") {
    if (!IMAGE_TYPES.has(mime)) {
      throw new Error("Only JPEG, PNG, WebP, GIF, or SVG images are allowed");
    }
    if (file.size > MAX_IMAGE_BYTES) throw new Error("Image must be 12MB or smaller");
    return;
  }
  if (assetType === "document") {
    if (!DOC_TYPES.has(mime)) throw new Error("Only PDF documents are allowed");
    if (file.size > MAX_DOC_BYTES) throw new Error("PDF must be 25MB or smaller");
    return;
  }
  if (assetType === "font") {
    if (!(FONT_TYPES.has(mime) || /\.(ttf|otf|woff2?)$/i.test(file.name))) {
      throw new Error("Only TTF, OTF, WOFF, or WOFF2 fonts are allowed");
    }
    if (file.size > MAX_FONT_BYTES) throw new Error("Font must be 8MB or smaller");
    return;
  }
  if (assetType === "video") {
    if (!VIDEO_TYPES.has(mime)) throw new Error("Only MP4, MOV, or WebM video is allowed");
    if (file.size > MAX_VIDEO_BYTES) throw new Error("Video must be 50MB or smaller");
  }
}

export async function uploadBrandMediaFile(params: {
  organizationId: string;
  brandId: string;
  file: File;
  assetType?: MediaAssetType;
  reservedTag?: string;
}): Promise<{
  publicUrl: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  assetType: MediaAssetType;
}> {
  const mime = params.file.type || "application/octet-stream";
  const assetType =
    params.assetType ?? inferMediaAssetType(mime, params.reservedTag);
  assertAllowed(params.file, assetType);

  const ext = extForMime(mime, params.file.name);
  const safeBase = params.file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);
  const finalPath = `${params.organizationId}/${params.brandId}/${Date.now()}-${safeBase || "asset"}.${ext}`;

  const buffer = Buffer.from(await params.file.arrayBuffer());
  const supabase = createAdminClient();

  const { error } = await supabase.storage
    .from(BRAND_MEDIA_BUCKET)
    .upload(finalPath, buffer, {
      contentType: mime,
      upsert: false,
    });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BRAND_MEDIA_BUCKET).getPublicUrl(finalPath);
  if (!data.publicUrl) throw new Error("Failed to resolve public media URL");

  return {
    publicUrl: data.publicUrl,
    path: finalPath,
    mimeType: mime,
    sizeBytes: params.file.size,
    assetType,
  };
}

export async function deleteBrandMediaFile(storagePath: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(BRAND_MEDIA_BUCKET)
    .remove([storagePath]);
  if (error) throw new Error(error.message);
}

export async function downloadBrandMediaBytes(storagePath: string): Promise<{
  bytes: Buffer;
  mimeType: string;
}> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(BRAND_MEDIA_BUCKET)
    .download(storagePath);
  if (error || !data) throw new Error(error?.message ?? "Download failed");
  const bytes = Buffer.from(await data.arrayBuffer());
  return { bytes, mimeType: data.type || "application/octet-stream" };
}
