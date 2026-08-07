import { describe, expect, it } from "vitest";
import {
  resolveGa4ConversionEvents,
  isPurchaseLikeEvent,
} from "@/lib/data/ga4-conversion-events";

describe("resolveGa4ConversionEvents", () => {
  it("prefers explicit brand configuration", () => {
    const result = resolveGa4ConversionEvents({
      configured: ["form_start"],
      discoveredEventNames: ["page_view", "purchase", "form_start"],
    });
    expect(result).toEqual({
      events: ["form_start"],
      mode: "configured",
    });
  });

  it("auto-selects purchase-like events when config empty", () => {
    const result = resolveGa4ConversionEvents({
      configured: [],
      discoveredEventNames: ["page_view", "purchase", "session_start", "booking"],
    });
    expect(result.mode).toBe("purchase_like_auto");
    expect(result.events.sort()).toEqual(["booking", "purchase"]);
  });

  it("returns none instead of summing all key events", () => {
    const result = resolveGa4ConversionEvents({
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

  it("recognizes purchase-like names case-insensitively", () => {
    expect(isPurchaseLikeEvent("Purchase")).toBe(true);
    expect(isPurchaseLikeEvent("PAGE_VIEW")).toBe(false);
  });
});
