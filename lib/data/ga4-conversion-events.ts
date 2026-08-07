/** Event names treated as purchase/booking conversions when no brand override is set. */
export const GA4_PURCHASE_LIKE_EVENTS = [
  "purchase",
  "ecommerce_purchase",
  "purchase_ecommerce",
  "in_app_purchase",
  "booking",
  "book",
  "booked",
  "reservation",
  "reserve",
  "order_complete",
  "order_completed",
  "checkout_completed",
  "payment_complete",
  "payment_completed",
] as const;

const PURCHASE_LIKE_SET = new Set(
  GA4_PURCHASE_LIKE_EVENTS.map((e) => e.toLowerCase()),
);

export function isPurchaseLikeEvent(eventName: string) {
  return PURCHASE_LIKE_SET.has(eventName.trim().toLowerCase());
}

/**
 * Resolve which GA4 events count as conversions.
 * - Explicit brand config wins.
 * - Otherwise: purchase-like events present in the property.
 * - Never fall back to "all key events" (that inflated page_view etc.).
 */
export function resolveGa4ConversionEvents(params: {
  configured: string[] | null | undefined;
  discoveredEventNames: string[];
}): { events: string[]; mode: "configured" | "purchase_like_auto" | "none" } {
  const configured = (params.configured ?? [])
    .map((e) => e.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return { events: [...new Set(configured)], mode: "configured" };
  }

  const auto = [
    ...new Set(
      params.discoveredEventNames.filter((name) => isPurchaseLikeEvent(name)),
    ),
  ];
  if (auto.length > 0) {
    return { events: auto, mode: "purchase_like_auto" };
  }

  return { events: [], mode: "none" };
}
