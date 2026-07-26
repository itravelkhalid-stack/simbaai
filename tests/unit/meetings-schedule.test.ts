import { describe, expect, it } from "vitest";

import {
  firstMondayDateKey,
  getZonedParts,
  isFirstMondayOfJanuary,
  isFirstMondayOfQuarter,
} from "@/lib/meetings/timezone";
import { parseMeetingsSettings } from "@/lib/meetings/settings";
import { previewUpcomingMeetings } from "@/lib/meetings/schedule";
import { DEFAULT_MEETINGS_SETTINGS } from "@/lib/types/meetings";

describe("meeting timezone helpers", () => {
  it("computes Europe/London parts", () => {
    // 2026-07-26 06:05 UTC = 07:05 BST
    const d = new Date("2026-07-26T06:05:00.000Z");
    const z = getZonedParts(d, "Europe/London");
    expect(z.hour).toBe(7);
    expect(z.dateKey).toBe("2026-07-26");
    expect(z.weekday).toBe(7); // Sunday
  });

  it("finds first Monday of January 2026", () => {
    expect(firstMondayDateKey(2026, 1, "Europe/London")).toBe("2026-01-05");
    const z = getZonedParts(new Date("2026-01-05T09:05:00.000Z"), "Europe/London");
    expect(isFirstMondayOfJanuary(z, "Europe/London")).toBe(true);
  });

  it("detects first Monday of quarter", () => {
    const april = getZonedParts(
      new Date("2026-04-06T08:05:00.000Z"),
      "Europe/London",
    );
    expect(isFirstMondayOfQuarter(april, "Europe/London")).toBe(true);
    const notFirst = getZonedParts(
      new Date("2026-04-13T08:05:00.000Z"),
      "Europe/London",
    );
    expect(isFirstMondayOfQuarter(notFirst, "Europe/London")).toBe(false);
  });
});

describe("meetings settings defaults", () => {
  it("defaults to London 7am daily / Mon 8am weekly", () => {
    const s = parseMeetingsSettings({});
    expect(s.timezone).toBe("Europe/London");
    expect(s.daily_standup_hour).toBe(7);
    expect(s.weekly_marketing_hour).toBe(8);
    expect(s.weekly_marketing_weekday).toBe(1);
    expect(s.annual_review_enabled).toBe(true);
  });

  it("maps legacy hour_utc keys", () => {
    const s = parseMeetingsSettings({
      meetings: { daily_standup_hour_utc: 6, weekly_marketing_hour_utc: 9 },
    });
    expect(s.daily_standup_hour).toBe(6);
    expect(s.weekly_marketing_hour).toBe(9);
  });
});

describe("upcoming preview", () => {
  it("includes daily standup near default hour", () => {
    const settings = { ...DEFAULT_MEETINGS_SETTINGS };
    // Pick a London 07:05 moment in winter (GMT)
    const from = new Date("2026-01-12T07:05:00.000Z"); // Monday
    const slots = previewUpcomingMeetings({
      settings,
      brandIds: ["brand-1"],
      from,
      hoursAhead: 2,
    });
    expect(slots.some((s) => s.type === "daily_standup")).toBe(true);
    expect(slots.some((s) => s.type === "weekly_marketing")).toBe(true);
  });
});
