/** Event names treated as purchase/booking revenue conversions when no brand override is set. */
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

function uniqueEvents(events: string[] | null | undefined) {
  return [...new Set((events ?? []).map((e) => e.trim()).filter(Boolean))];
}

/**
 * Resolve which GA4 events count as revenue conversions.
 * - Explicit brand revenue config wins.
 * - Otherwise: purchase-like events present on the property.
 * - Never fall back to all key events or intent proxies.
 */
export function resolveGa4RevenueEvents(params: {
  configured: string[] | null | undefined;
  discoveredEventNames: string[];
}): { events: string[]; mode: "configured" | "purchase_like_auto" | "none" } {
  const configured = uniqueEvents(params.configured);
  if (configured.length > 0) {
    return { events: configured, mode: "configured" };
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

/**
 * Resolve engagement/intent proxy events (explicit brand config only).
 * Revenue events are stripped if they appear in both lists.
 */
export function resolveGa4IntentEvents(params: {
  configured: string[] | null | undefined;
  revenueEvents: string[];
}): { events: string[]; mode: "configured" | "none" } {
  const revenue = new Set(params.revenueEvents.map((e) => e.toLowerCase()));
  const configured = uniqueEvents(params.configured).filter(
    (e) => !revenue.has(e.toLowerCase()),
  );
  if (configured.length > 0) {
    return { events: configured, mode: "configured" };
  }
  return { events: [], mode: "none" };
}

/** @deprecated Use resolveGa4RevenueEvents */
export function resolveGa4ConversionEvents(params: {
  configured: string[] | null | undefined;
  discoveredEventNames: string[];
}) {
  return resolveGa4RevenueEvents(params);
}

export function hasGa4RevenueTracking(params: {
  conversionEventNames: string[] | null | undefined;
  discoveredEventNames: string[] | null | undefined;
}) {
  const resolved = resolveGa4RevenueEvents({
    configured: params.conversionEventNames,
    discoveredEventNames: params.discoveredEventNames ?? [],
  });
  return resolved.mode !== "none" && resolved.events.length > 0;
}

export const GA4_REVENUE_SETUP_BLOCKER = {
  id: "ga4-revenue-tracking",
  title: "GA4 purchase/revenue tracking not configured",
  detail:
    "Implement a purchase, booking, or checkout-complete event on the site, mark it as a key event in GA4, then select it under Data → Settings as a revenue conversion event. Until then, form_start and similar events are intent proxies only — do not compute ROAS, CPA, or revenue attribution from them.",
  href: "/data/settings",
  cta: "Configure GA4 events",
} as const;
