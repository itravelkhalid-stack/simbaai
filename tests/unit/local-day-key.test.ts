import { describe, expect, it } from "vitest";
import {
  localDayKey,
  localDayKeyFromIso,
  toDatetimeLocalValue,
} from "@/lib/datetime/local";

describe("local calendar day keys", () => {
  it("does not use UTC midnight for local day cells", () => {
    // Construct a local calendar day at midnight — UTC slice would often be prior day in BST/CET.
    const localMidnight = new Date(2026, 7, 8, 0, 0, 0, 0); // Aug 8 local
    expect(localDayKey(localMidnight)).toBe("2026-08-08");
    // Contrasting incorrect pattern used before the fix:
    expect(localMidnight.toISOString().slice(0, 10)).not.toBe(
      localDayKey(localMidnight),
    );
  });

  it("groups scheduled_at by local calendar day", () => {
    // 08:20 UTC on Aug 8 is still Aug 8 in Europe/London (BST).
    expect(localDayKeyFromIso("2026-08-08T08:20:00.000Z")).toBe("2026-08-08");
  });

  it("round-trips datetime-local display without UTC shift", () => {
    const iso = "2026-08-08T08:20:00.000Z";
    const local = new Date(iso);
    const value = toDatetimeLocalValue(iso);
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    // Reconstruct from datetime-local semantics (no Z → local)
    const [datePart, timePart] = value.split("T");
    const [y, m, d] = datePart!.split("-").map(Number);
    const [hh, mm] = timePart!.split(":").map(Number);
    const rebuilt = new Date(y!, m! - 1, d!, hh!, mm!);
    expect(rebuilt.getTime()).toBe(
      new Date(
        local.getFullYear(),
        local.getMonth(),
        local.getDate(),
        local.getHours(),
        local.getMinutes(),
      ).getTime(),
    );
  });
});
