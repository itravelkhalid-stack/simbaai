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

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function isGif(bytes: Buffer): boolean {
  return bytes.length >= 6 && bytes.subarray(0, 3).toString("ascii") === "GIF";
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (!isPng(bytes) || bytes.length < 24) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height };
}

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (!isJpeg(bytes)) return null;
  let offset = 2;
  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = bytes.readUInt16BE(offset + 5);
      const width = bytes.readUInt16BE(offset + 7);
      if (!width || !height) return null;
      return { width, height };
    }
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
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

  let mimeType: "image/jpeg" | "image/png";
  let filename: string;
  let parsed: { width: number; height: number } | null = null;
  if (isJpeg(bytes)) {
    mimeType = "image/jpeg";
    filename = "creative.jpg";
    parsed = jpegDimensions(bytes);
  } else if (isPng(bytes)) {
    mimeType = "image/png";
    filename = "creative.png";
    parsed = pngDimensions(bytes);
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
