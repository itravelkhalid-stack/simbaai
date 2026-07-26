/**
 * Timezone helpers for meeting schedules (default Europe/London).
 * Uses Intl — no extra dependency.
 */

export type ZonedParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  /** ISO weekday Monday=1 … Sunday=7 */
  weekday: number;
  dateKey: string;
};

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const weekday = WEEKDAY_MAP[parts.weekday ?? "Mon"] ?? 1;
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

/** First Monday of a given month (1–12) in the timezone, as a dateKey. */
export function firstMondayDateKey(
  year: number,
  month: number,
  timeZone: string,
): string {
  // Start from the 1st at noon UTC and walk until local weekday is Monday
  // and local month/year match — noon avoids DST edge ambiguity.
  for (let day = 1; day <= 7; day += 1) {
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const z = getZonedParts(probe, timeZone);
    if (z.year === year && z.month === month && z.weekday === 1) {
      return z.dateKey;
    }
  }
  // Fallback — should be unreachable
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function isFirstMondayOfQuarter(parts: ZonedParts, timeZone: string) {
  if (![1, 4, 7, 10].includes(parts.month)) return false;
  return (
    parts.dateKey ===
    firstMondayDateKey(parts.year, parts.month, timeZone)
  );
}

export function isFirstMondayOfJanuary(parts: ZonedParts, timeZone: string) {
  if (parts.month !== 1) return false;
  return parts.dateKey === firstMondayDateKey(parts.year, 1, timeZone);
}
