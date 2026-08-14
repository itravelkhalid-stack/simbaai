import {
  isGif,
  isJpeg,
  isPng,
  isWebp,
  rasterSizeFromBytes,
} from "@/lib/media/image-size";

/** Meta link-ad image minimum (shortest side). */
export const META_AD_IMAGE_MIN_PX = 600;
/** Meta Marketing API hard max for ad images. */
export const META_AD_IMAGE_MAX_BYTES = 30 * 1024 * 1024;
/** Acceptable aspect ratios for feed/link placements (width/height). */
const META_ASPECT_MIN = 0.4; // ~9:16 stories / tall
const META_ASPECT_MAX = 1.91; // landscape link ads

export type ValidatedMetaAdImage = {
  uploadBytes: Buffer;
  mimeType: "image/jpeg" | "image/png";
  filename: string;
  width: number | null;
  height: number | null;
};

export type KnownMediaDimensions = {
  width?: number | null;
  height?: number | null;
};

/**
 * Extract brand-media storage path from a Supabase public or signed URL.
 * Private buckets return 400/403 on `/object/public/...` — never HTTP-fetch those.
 */
export function brandMediaStoragePathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign)\/brand-media\/(.+)$/,
    );
    if (!match?.[1]) return null;
    return decodeURIComponent(match[1].split("?")[0] ?? "");
  } catch {
    return null;
  }
}

/**
 * Validate image bytes for Meta adimages without native deps (no sharp).
 * Uploads the original JPG/PNG bytes. Rejects other formats instead of converting.
 */
export function validateMetaAdImage(
  bytes: Buffer,
  known?: KnownMediaDimensions,
): ValidatedMetaAdImage {
  if (!bytes.length) {
    throw new Error("Creative image is empty.");
  }
  if (bytes.length > META_AD_IMAGE_MAX_BYTES) {
    throw new Error(
      `Creative image is ${(bytes.length / (1024 * 1024)).toFixed(1)}MB — Meta allows at most 30MB.`,
    );
  }

  if (isGif(bytes) || isWebp(bytes)) {
    throw new Error(
      "Meta ad images must be JPG or PNG. Convert this WebP/GIF and re-attach it before Create PAUSED.",
    );
  }

  const parsed = rasterSizeFromBytes(bytes);
  let mimeType: "image/jpeg" | "image/png";
  let filename: string;
  if (isJpeg(bytes)) {
    mimeType = "image/jpeg";
    filename = "creative.jpg";
  } else if (isPng(bytes)) {
    mimeType = "image/png";
    filename = "creative.png";
  } else {
    throw new Error(
      "Creative image is not a JPG or PNG. Meta adimages only accept those formats.",
    );
  }

  const width = parsed?.width ?? known?.width ?? null;
  const height = parsed?.height ?? known?.height ?? null;
  if (width != null && height != null) {
    if (width < META_AD_IMAGE_MIN_PX || height < META_AD_IMAGE_MIN_PX) {
      throw new Error(
        `Creative image is ${width}×${height}px — Meta requires at least ${META_AD_IMAGE_MIN_PX}×${META_AD_IMAGE_MIN_PX}px.`,
      );
    }
    const aspect = width / height;
    if (aspect < META_ASPECT_MIN || aspect > META_ASPECT_MAX) {
      throw new Error(
        `Creative image aspect ratio ${aspect.toFixed(2)} (${width}×${height}) is outside Meta’s usable range (~0.4–1.91). Crop closer to 1:1 or 1.91:1.`,
      );
    }
  }

  return {
    uploadBytes: bytes,
    mimeType,
    filename,
    width,
    height,
  };
}
