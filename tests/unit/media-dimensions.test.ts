import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { rasterSizeFromBytes } from "@/lib/media/image-size";
import {
  assetQualifiesForSlot,
  suitableFormatsForDimensions,
} from "@/lib/media/format-fit";

const beachPng = readFileSync(
  resolve(__dirname, "../fixtures/meta-ad-700.png"),
);

describe("rasterSizeFromBytes", () => {
  it("reads PNG IHDR", () => {
    expect(rasterSizeFromBytes(beachPng)).toEqual({
      width: 700,
      height: 700,
      format: "png",
    });
  });

  it("reads GIF logical screen", () => {
    const gif = Buffer.alloc(10);
    gif.write("GIF89a", 0, "ascii");
    gif.writeUInt16LE(1080, 6);
    gif.writeUInt16LE(1920, 8);
    expect(rasterSizeFromBytes(gif)).toEqual({
      width: 1080,
      height: 1920,
      format: "gif",
    });
  });

  it("returns null for empty/unknown", () => {
    expect(rasterSizeFromBytes(Buffer.alloc(0))).toBeNull();
    expect(rasterSizeFromBytes(Buffer.from("not-an-image"))).toBeNull();
  });
});

describe("assetQualifiesForSlot gating", () => {
  it("does not pass through when dimensions and formats are missing", () => {
    expect(
      assetQualifiesForSlot({
        suitableFormats: [],
        width: null,
        height: null,
        slot: "instagram_feed",
      }),
    ).toBe(false);
  });

  it("uses stored suitable_formats when present", () => {
    expect(
      assetQualifiesForSlot({
        suitableFormats: ["instagram_story", "facebook_story"],
        width: 1,
        height: 1,
        slot: "instagram_story",
      }),
    ).toBe(true);
    expect(
      assetQualifiesForSlot({
        suitableFormats: ["instagram_story"],
        width: 1200,
        height: 628,
        slot: "facebook_feed",
      }),
    ).toBe(false);
  });

  it("falls back to width/height when formats empty", () => {
    expect(
      assetQualifiesForSlot({
        suitableFormats: [],
        width: 1080,
        height: 1920,
        slot: "instagram_story",
      }),
    ).toBe(true);
    expect(
      assetQualifiesForSlot({
        suitableFormats: [],
        width: 1080,
        height: 1920,
        slot: "instagram_feed",
      }),
    ).toBe(false);
    expect(suitableFormatsForDimensions(1080, 1920)).toEqual(
      expect.arrayContaining(["instagram_story", "facebook_story"]),
    );
  });
});
