import type { MediaAssetType } from "@/lib/types/media";

/** Client + server shared limits. Files never transit Next.js for brand-media. */
export const BRAND_MEDIA_BUCKET = "brand-media";
export const MAX_DIRECT_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_FONT_UPLOAD_BYTES = 8 * 1024 * 1024;

export const DIRECT_UPLOAD_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const DIRECT_UPLOAD_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const DIRECT_UPLOAD_DOC_TYPES = new Set(["application/pdf"]);

export const DIRECT_UPLOAD_FONT_TYPES = new Set([
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

export type DirectUploadKind = "media" | "logo" | "document" | "font";

export function validateDirectUploadFile(
  file: File,
  kind: DirectUploadKind = "media",
): string | null {
  if (!file || file.size === 0) return "Choose a file to upload";

  const mime = file.type || "application/octet-stream";

  if (kind === "media") {
    const ok =
      DIRECT_UPLOAD_IMAGE_TYPES.has(mime) ||
      DIRECT_UPLOAD_VIDEO_TYPES.has(mime) ||
      mime.startsWith("image/") ||
      mime.startsWith("video/");
    if (!ok) return "Only images and videos are allowed";
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      return "File must be 25MB or smaller";
    }
    return null;
  }

  if (kind === "logo") {
    if (!(DIRECT_UPLOAD_IMAGE_TYPES.has(mime) || mime.startsWith("image/"))) {
      return "Only image files are allowed for logos";
    }
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      return "File must be 25MB or smaller";
    }
    return null;
  }

  if (kind === "document") {
    if (!DIRECT_UPLOAD_DOC_TYPES.has(mime)) return "Only PDF documents are allowed";
    if (file.size > MAX_DIRECT_UPLOAD_BYTES) {
      return "PDF must be 25MB or smaller";
    }
    return null;
  }

  if (kind === "font") {
    if (
      !(
        DIRECT_UPLOAD_FONT_TYPES.has(mime) ||
        /\.(ttf|otf|woff2?)$/i.test(file.name)
      )
    ) {
      return "Only TTF, OTF, WOFF, or WOFF2 fonts are allowed";
    }
    if (file.size > MAX_FONT_UPLOAD_BYTES) {
      return "Font must be 8MB or smaller";
    }
    return null;
  }

  return null;
}

export function inferAssetTypeFromUpload(
  mime: string,
  kind: DirectUploadKind,
  reservedTag?: string,
): MediaAssetType {
  if (reservedTag?.startsWith("logo-") || kind === "logo") return "logo";
  if (reservedTag?.startsWith("font-") || kind === "font") return "font";
  if (reservedTag === "guidelines-doc" || kind === "document") return "document";
  if (DIRECT_UPLOAD_VIDEO_TYPES.has(mime) || mime.startsWith("video/")) {
    return "video";
  }
  return "image";
}

export function buildBrandMediaObjectPath(params: {
  organizationId: string;
  brandId: string;
  filename: string;
}): string {
  const ext = params.filename.split(".").pop()?.toLowerCase() || "bin";
  const safeExt = ext.length <= 8 ? ext : "bin";
  const safeBase = params.filename
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 60);
  return `${params.organizationId}/${params.brandId}/${Date.now()}-${safeBase || "asset"}.${safeExt}`;
}
