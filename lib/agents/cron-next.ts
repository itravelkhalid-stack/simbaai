/**
 * Minimal next-occurrence calculator for the 5-field cron schedules used in-repo.
 * Supports stars, literals, and star-slash-N step fields.
 */

function parseField(
  field: string,
  min: number,
  max: number,
): { values: Set<number>; step: number | null } {
  if (field === "*") {
    return {
      values: new Set(
        Array.from({ length: max - min + 1 }, (_, i) => min + i),
      ),
      step: null,
    };
  }
  if (field.startsWith("*/")) {
    const step = Number(field.slice(2));
    const values = new Set<number>();
    for (let i = min; i <= max; i += step) values.add(i);
    return { values, step };
  }
  const n = Number(field);
  if (Number.isFinite(n)) return { values: new Set([n]), step: null };
  return {
    values: new Set(
      Array.from({ length: max - min + 1 }, (_, i) => min + i),
    ),
    step: null,
  };
}

function matches(
  date: Date,
  minute: Set<number>,
  hour: Set<number>,
  dom: Set<number>,
  month: Set<number>,
  dow: Set<number>,
) {
  // cron DOW: 0=Sun … 6=Sat (same as JS getUTCDay)
  return (
    minute.has(date.getUTCMinutes()) &&
    hour.has(date.getUTCHours()) &&
    dom.has(date.getUTCDate()) &&
    month.has(date.getUTCMonth() + 1) &&
    dow.has(date.getUTCDay())
  );
}

/** Next UTC Date that matches the cron expression, or null if unparseable. */
export function nextCronOccurrence(
  schedule: string,
  from: Date = new Date(),
): Date | null {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [mF, hF, domF, monF, dowF] = parts;
  const minute = parseField(mF, 0, 59).values;
  const hour = parseField(hF, 0, 23).values;
  const dom = parseField(domF, 1, 31).values;
  const month = parseField(monF, 1, 12).values;
  const dow = parseField(dowF, 0, 6).values;

  const cursor = new Date(from);
  cursor.setUTCSeconds(0, 0);
  cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);

  // Cap search at ~8 days of minute steps for */5 etc.
  const maxSteps = 60 * 24 * 8;
  for (let i = 0; i < maxSteps; i++) {
    if (matches(cursor, minute, hour, dom, month, dow)) {
      return new Date(cursor);
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

export function formatNextRun(isoOrNull: string | null): string {
  if (!isoOrNull) return "—";
  const d = new Date(isoOrNull);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
