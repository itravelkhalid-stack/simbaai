import sharp, { type Metadata } from "sharp";

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
  width: number;
  height: number;
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
 * Validate / normalize image bytes for Meta adimages.
 * Rejects undersized, huge, or unsupported formats with a clear pre-flight message.
 * Converts webp/gif to PNG so Meta always receives jpg or png.
 */
export async function validateMetaAdImage(
  bytes: Buffer,
): Promise<ValidatedMetaAdImage> {
  if (!bytes.length) {
    throw new Error("Creative image is empty.");
  }
  if (bytes.length > META_AD_IMAGE_MAX_BYTES) {
    throw new Error(
      `Creative image is ${(bytes.length / (1024 * 1024)).toFixed(1)}MB — Meta allows at most 30MB.`,
    );
  }

  let meta: Metadata;
  try {
    meta = await sharp(bytes, { failOn: "none" }).metadata();
  } catch {
    throw new Error(
      "Creative image could not be decoded. Use a JPG or PNG (≥600px on each side).",
    );
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
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

  const format = (meta.format ?? "").toLowerCase();
  if (format === "jpeg" || format === "jpg") {
    return {
      uploadBytes: bytes,
      mimeType: "image/jpeg",
      filename: "creative.jpg",
      width,
      height,
    };
  }
  if (format === "png") {
    return {
      uploadBytes: bytes,
      mimeType: "image/png",
      filename: "creative.png",
      width,
      height,
    };
  }

  // Meta adimages: JPG/PNG only — convert other raster formats.
  const uploadBytes = await sharp(bytes).png().toBuffer();
  if (uploadBytes.length > META_AD_IMAGE_MAX_BYTES) {
    const jpeg = await sharp(bytes).jpeg({ quality: 90 }).toBuffer();
    if (jpeg.length > META_AD_IMAGE_MAX_BYTES) {
      throw new Error(
        "Converted creative still exceeds Meta’s 30MB limit. Use a smaller JPG or PNG.",
      );
    }
    return {
      uploadBytes: jpeg,
      mimeType: "image/jpeg",
      filename: "creative.jpg",
      width,
      height,
    };
  }
  return {
    uploadBytes,
    mimeType: "image/png",
    filename: "creative.png",
    width,
    height,
  };
}
