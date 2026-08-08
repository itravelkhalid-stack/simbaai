/**
 * Destination booking-window rules for Meta (and paid) destination ads.
 *
 * Advertise a destination stay-month when:
 * 1. visit_attractiveness is peak or shoulder (never off), AND
 * 2. "now" falls inside the typical booking lead window ahead of that stay month.
 */

export type VisitAttractiveness = "peak" | "shoulder" | "off";

export type SeasonalityMonthRow = {
  destination_slug: string;
  destination_name: string;
  stay_month: number; // 1–12
  visit_attractiveness: VisitAttractiveness;
  booking_lead_min_days: number;
  booking_lead_max_days: number;
  notes?: string | null;
};

export type BookingWindowDecision = {
  ok: boolean;
  reason: string;
  stayMonthStart: string;
  windowStart: string;
  windowEnd: string;
};

function utcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number) {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * First day of the stay month on or after `asOf` (rolls to next year if month already passed).
 */
export function nextStayMonthStart(asOf: Date, stayMonth: number): Date {
  if (stayMonth < 1 || stayMonth > 12) {
    throw new Error(`stay_month must be 1–12, got ${stayMonth}`);
  }
  const day = utcDay(asOf);
  let year = day.getUTCFullYear();
  let start = new Date(Date.UTC(year, stayMonth - 1, 1));
  // If stay month start is more than ~half a month in the past relative to asOf, use next year
  if (start.getTime() < addUtcDays(day, -14).getTime()) {
    year += 1;
    start = new Date(Date.UTC(year, stayMonth - 1, 1));
  }
  return start;
}

/**
 * Evaluate whether we may run ads *now* for a given destination stay month row.
 */
export function evaluateDestinationBookingWindow(
  row: SeasonalityMonthRow,
  asOf: Date = new Date(),
): BookingWindowDecision {
  const stayStart = nextStayMonthStart(asOf, row.stay_month);
  const windowStart = addUtcDays(stayStart, -row.booking_lead_max_days);
  const windowEnd = addUtcDays(stayStart, -row.booking_lead_min_days);
  const now = utcDay(asOf);

  const base = {
    stayMonthStart: isoDate(stayStart),
    windowStart: isoDate(windowStart),
    windowEnd: isoDate(windowEnd),
  };

  if (row.visit_attractiveness === "off") {
    return {
      ok: false,
      reason: `${row.destination_name} ${monthName(row.stay_month)} is off-peak — do not advertise imminent/low-value stays for this month.`,
      ...base,
    };
  }

  if (now.getTime() < windowStart.getTime()) {
    return {
      ok: false,
      reason: `Too early to advertise ${row.destination_name} ${monthName(row.stay_month)} stays (booking window ${base.windowStart} → ${base.windowEnd}).`,
      ...base,
    };
  }

  if (now.getTime() > windowEnd.getTime()) {
    return {
      ok: false,
      reason: `Booking window closed for ${row.destination_name} ${monthName(row.stay_month)} stays (window ${base.windowStart} → ${base.windowEnd}).`,
      ...base,
    };
  }

  return {
    ok: true,
    reason: `${row.destination_name} ${monthName(row.stay_month)} is ${row.visit_attractiveness}; now is inside the ${row.booking_lead_min_days}–${row.booking_lead_max_days} day booking lead window.`,
    ...base,
  };
}

/** Open admissible stay-months for a destination as of `asOf`. */
export function listAdmissibleStayMonths(
  rows: SeasonalityMonthRow[],
  asOf: Date = new Date(),
): Array<SeasonalityMonthRow & { decision: BookingWindowDecision }> {
  return rows
    .map((row) => ({
      ...row,
      decision: evaluateDestinationBookingWindow(row, asOf),
    }))
    .filter((r) => r.decision.ok);
}

function monthName(m: number) {
  return (
    [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ][m - 1] ?? `month ${m}`
  );
}

/**
 * Suggested Marmaris beach seasonality seed (lead times in days).
 * Summer peak booked ~3–6 months ahead; winter beach is off.
 */
export const MARMARIS_SEASONALITY_SEED: SeasonalityMonthRow[] = [
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 1, visit_attractiveness: "off", booking_lead_min_days: 14, booking_lead_max_days: 60 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 2, visit_attractiveness: "off", booking_lead_min_days: 14, booking_lead_max_days: 60 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 3, visit_attractiveness: "shoulder", booking_lead_min_days: 30, booking_lead_max_days: 120 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 4, visit_attractiveness: "shoulder", booking_lead_min_days: 45, booking_lead_max_days: 150 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 5, visit_attractiveness: "peak", booking_lead_min_days: 60, booking_lead_max_days: 180 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 6, visit_attractiveness: "peak", booking_lead_min_days: 90, booking_lead_max_days: 180 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 7, visit_attractiveness: "peak", booking_lead_min_days: 90, booking_lead_max_days: 180 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 8, visit_attractiveness: "peak", booking_lead_min_days: 90, booking_lead_max_days: 180 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 9, visit_attractiveness: "peak", booking_lead_min_days: 60, booking_lead_max_days: 150 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 10, visit_attractiveness: "shoulder", booking_lead_min_days: 30, booking_lead_max_days: 120 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 11, visit_attractiveness: "off", booking_lead_min_days: 14, booking_lead_max_days: 60 },
  { destination_slug: "marmaris", destination_name: "Marmaris", stay_month: 12, visit_attractiveness: "off", booking_lead_min_days: 14, booking_lead_max_days: 60 },
];
