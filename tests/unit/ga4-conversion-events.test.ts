import { describe, expect, it } from "vitest";
import {
  hasGa4RevenueTracking,
  isPurchaseLikeEvent,
  resolveGa4IntentEvents,
  resolveGa4RevenueEvents,
} from "@/lib/data/ga4-conversion-events";

describe("resolveGa4RevenueEvents", () => {
  it("prefers explicit brand revenue configuration", () => {
    const result = resolveGa4RevenueEvents({
      configured: ["purchase"],
      discoveredEventNames: ["page_view", "purchase", "form_start"],
    });
    expect(result).toEqual({
      events: ["purchase"],
      mode: "configured",
    });
  });

  it("auto-selects purchase-like events when revenue config empty", () => {
    const result = resolveGa4RevenueEvents({
      configured: [],
      discoveredEventNames: ["page_view", "purchase", "session_start", "booking"],
    });
    expect(result.mode).toBe("purchase_like_auto");
    expect(result.events.sort()).toEqual(["booking", "purchase"]);
  });

  it("returns none instead of summing all key events", () => {
    const result = resolveGa4RevenueEvents({
      configured: null,
      discoveredEventNames: [
        "page_view",
        "session_start",
        "first_visit",
        "user_engagement",
        "form_start",
      ],
    });
    expect(result).toEqual({ events: [], mode: "none" });
  });
});

describe("resolveGa4IntentEvents", () => {
  it("uses explicit intent config and strips revenue events", () => {
    const result = resolveGa4IntentEvents({
      configured: ["form_start", "purchase"],
      revenueEvents: ["purchase"],
    });
    expect(result).toEqual({
      events: ["form_start"],
      mode: "configured",
    });
  });

  it("returns none when no intent configured", () => {
    expect(
      resolveGa4IntentEvents({
        configured: [],
        revenueEvents: ["purchase"],
      }),
    ).toEqual({ events: [], mode: "none" });
  });
});

describe("hasGa4RevenueTracking", () => {
  it("is false when only intent proxies exist", () => {
    expect(
      hasGa4RevenueTracking({
        conversionEventNames: [],
        discoveredEventNames: ["form_start", "page_view"],
      }),
    ).toBe(false);
  });

  it("is true when purchase-like events are discovered", () => {
    expect(
      hasGa4RevenueTracking({
        conversionEventNames: [],
        discoveredEventNames: ["purchase"],
      }),
    ).toBe(true);
  });

  it("recognizes purchase-like names case-insensitively", () => {
    expect(isPurchaseLikeEvent("Purchase")).toBe(true);
    expect(isPurchaseLikeEvent("PAGE_VIEW")).toBe(false);
  });
});
