import { describe, expect, it } from "vitest";
import {
  evaluateDestinationBookingWindow,
  listAdmissibleStayMonths,
  MARMARIS_SEASONALITY_SEED,
  nextStayMonthStart,
} from "@/lib/ads/booking-window";

describe("destination booking window", () => {
  it("in January, Marmaris summer-booking campaigns are valid", () => {
    const asOf = new Date("2026-01-15T12:00:00.000Z");
    const june = MARMARIS_SEASONALITY_SEED.find((r) => r.stay_month === 6)!;
    const decision = evaluateDestinationBookingWindow(june, asOf);
    expect(decision.ok).toBe(true);
    expect(decision.reason).toMatch(/peak|window/i);

    const admissible = listAdmissibleStayMonths(MARMARIS_SEASONALITY_SEED, asOf);
    expect(admissible.some((r) => r.stay_month === 6 || r.stay_month === 7)).toBe(
      true,
    );
  });

  it("in January, Marmaris January-stay campaigns are vetoed (off-peak)", () => {
    const asOf = new Date("2026-01-15T12:00:00.000Z");
    const january = MARMARIS_SEASONALITY_SEED.find((r) => r.stay_month === 1)!;
    const decision = evaluateDestinationBookingWindow(january, asOf);
    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/off-peak/i);
  });

  it("rolls stay month to next year when needed", () => {
    const asOf = new Date("2026-11-01T00:00:00.000Z");
    const start = nextStayMonthStart(asOf, 6);
    expect(start.toISOString().slice(0, 10)).toBe("2027-06-01");
  });
});
