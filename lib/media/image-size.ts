/**
 * Raster width/height from file headers. No native deps — upload-time probe
 * and Meta validation must not wait on sharp.
 */

export type RasterFormat = "jpeg" | "png" | "gif" | "webp";

export type RasterSize = {
  width: number;
  height: number;
  format: RasterFormat;
};

export function isJpeg(bytes: Buffer): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

export function isPng(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export function isGif(bytes: Buffer): boolean {
  return bytes.length >= 6 && bytes.subarray(0, 3).toString("ascii") === "GIF";
}

export function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function pngSize(bytes: Buffer): RasterSize | null {
  if (!isPng(bytes) || bytes.length < 24) return null;
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!width || !height) return null;
  return { width, height, format: "png" };
}

function jpegSize(bytes: Buffer): RasterSize | null {
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
      return { width, height, format: "jpeg" };
    }
    if (
      marker === 0xd8 ||
      marker === 0xd9 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

function gifSize(bytes: Buffer): RasterSize | null {
  if (!isGif(bytes) || bytes.length < 10) return null;
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  if (!width || !height) return null;
  return { width, height, format: "gif" };
}

function readUInt24LE(bytes: Buffer, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

function webpSize(bytes: Buffer): RasterSize | null {
  if (!isWebp(bytes) || bytes.length < 30) return null;
  const chunk = bytes.subarray(12, 16).toString("ascii");
  if (chunk === "VP8X") {
    const width = readUInt24LE(bytes, 24) + 1;
    const height = readUInt24LE(bytes, 27) + 1;
    if (!width || !height) return null;
    return { width, height, format: "webp" };
  }
  if (chunk === "VP8 " && bytes.length >= 30) {
    // Lossy: 0x9d 0x01 0x2a then 14-bit width/height
    const start = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a]));
    if (start < 0 || start + 7 >= bytes.length) return null;
    const width = bytes.readUInt16LE(start + 3) & 0x3fff;
    const height = bytes.readUInt16LE(start + 5) & 0x3fff;
    if (!width || !height) return null;
    return { width, height, format: "webp" };
  }
  if (chunk === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (!width || !height) return null;
    return { width, height, format: "webp" };
  }
  return null;
}

/** Read pixel size from JPEG/PNG/GIF/WebP headers. Returns null if unknown. */
export function rasterSizeFromBytes(bytes: Buffer): RasterSize | null {
  if (!bytes.length) return null;
  if (isPng(bytes)) return pngSize(bytes);
  if (isJpeg(bytes)) return jpegSize(bytes);
  if (isGif(bytes)) return gifSize(bytes);
  if (isWebp(bytes)) return webpSize(bytes);
  return null;
}
