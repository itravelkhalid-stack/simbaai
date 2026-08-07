import { describe, expect, it } from "vitest";
import {
  computeCadenceGaps,
  DEFAULT_CONTENT_CADENCE,
  formatBucket,
  resolveContentCadence,
  slotHourUtc,
} from "@/lib/content/cadence";

describe("resolveContentCadence", () => {
  it("uses product defaults for enabled platforms", () => {
    const targets = resolveContentCadence({}, ["instagram", "facebook"]);
    expect(targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          platform: "instagram",
          kind: "feed",
          perDay: DEFAULT_CONTENT_CADENCE.instagram.feed_per_day,
        }),
        expect.objectContaining({
          platform: "instagram",
          kind: "story",
          perDay: DEFAULT_CONTENT_CADENCE.instagram.stories_per_day,
        }),
        expect.objectContaining({
          platform: "facebook",
          kind: "feed",
          perDay: DEFAULT_CONTENT_CADENCE.facebook.feed_per_day,
        }),
      ]),
    );
    expect(targets.find((t) => t.platform === "linkedin")).toBeUndefined();
  });

  it("respects brand overrides and skips disabled LinkedIn", () => {
    const targets = resolveContentCadence(
      {
        instagram: { feed_per_day: 1, stories_per_day: 0 },
        facebook: { feed_per_day: 2 },
      },
      ["instagram", "facebook", "linkedin"],
    );
    expect(targets.find((t) => t.platform === "instagram" && t.kind === "story")).toBeUndefined();
    expect(
      targets.find((t) => t.platform === "facebook")?.perDay,
    ).toBe(2);
    expect(
      targets.find((t) => t.platform === "linkedin")?.perDay,
    ).toBe(1);
  });
});

describe("computeCadenceGaps", () => {
  it("fills missing slots across the horizon", () => {
    const targets = resolveContentCadence({}, ["instagram"]);
    const existing = new Map<string, number>([
      ["2026-08-07|instagram|feed", 1],
    ]);
    const gaps = computeCadenceGaps({
      targets,
      existingCounts: existing,
      horizonDays: 1,
      fromDate: new Date("2026-08-07T12:00:00.000Z"),
    });
    // 2 feed default − 1 existing = 1 feed gap; 2 story gaps
    expect(gaps.filter((g) => g.kind === "feed")).toHaveLength(1);
    expect(gaps.filter((g) => g.kind === "story")).toHaveLength(2);
    expect(gaps.every((g) => g.date === "2026-08-07")).toBe(true);
  });
});

describe("format helpers", () => {
  it("buckets story vs feed", () => {
    expect(formatBucket("story")).toBe("story");
    expect(formatBucket("carousel")).toBe("feed");
  });

  it("spreads slot hours", () => {
    expect(slotHourUtc("feed", 0)).toBe(9);
    expect(slotHourUtc("story", 0)).toBe(11);
  });
});
