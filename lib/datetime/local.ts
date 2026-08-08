/**
 * Local-calendar date helpers. Avoid Date#toISOString().slice(0, 10) for UI
 * day keys — in timezones ahead of UTC, local midnight becomes the previous
 * UTC date and calendar cells mis-align (today + scheduled items shift).
 */

export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Calendar day for an Instant / ISO timestamp in the viewer's local TZ. */
export function localDayKeyFromIso(iso: string): string {
  return localDayKey(new Date(iso));
}

/** Value for <input type="datetime-local"> from an ISO timestamptz. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}
