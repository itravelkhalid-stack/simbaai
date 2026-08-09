export type AdsApiErrorBody = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  error_user_title?: string;
  error_user_msg?: string;
};

/**
 * Format Meta Graph / Ads API error payloads for humans and logs.
 * Handles `{ error: { message, code, fbtrace_id, ... } }` and string bodies.
 */
export function formatAdsApiError(body: unknown, status?: number): string {
  const prefix = status != null ? `Ads API ${status}` : "Ads API";
  if (typeof body !== "object" || body == null) {
    const text = typeof body === "string" && body.trim() ? body : "Unknown error";
    return `${prefix}: ${text}`;
  }

  const record = body as { error?: unknown; message?: unknown };
  const raw = record.error ?? body;
  if (typeof raw === "string") {
    return `${prefix}: ${raw}`;
  }
  if (typeof raw !== "object" || raw == null) {
    return `${prefix}: ${JSON.stringify(body)}`;
  }

  const err = raw as AdsApiErrorBody;
  const message =
    err.error_user_msg?.trim() ||
    err.message?.trim() ||
    err.error_user_title?.trim() ||
    JSON.stringify(raw);

  const parts = [`${prefix}: ${message}`];
  if (err.code != null) parts.push(`code=${err.code}`);
  if (err.error_subcode != null) parts.push(`subcode=${err.error_subcode}`);
  if (err.type) parts.push(`type=${err.type}`);
  if (err.fbtrace_id) parts.push(`fbtrace_id=${err.fbtrace_id}`);
  return parts.join(" · ");
}

export function extractFbtraceId(body: unknown): string | undefined {
  if (typeof body !== "object" || body == null) return undefined;
  const record = body as { error?: AdsApiErrorBody | string };
  if (typeof record.error === "object" && record.error?.fbtrace_id) {
    return record.error.fbtrace_id;
  }
  const direct = body as AdsApiErrorBody;
  return direct.fbtrace_id;
}

export async function adsFetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(
      formatAdsApiError(body ?? (text || res.statusText), res.status),
    );
  }
  // Some Meta endpoints return HTTP 200 with `{ error: {...} }`
  if (
    typeof body === "object" &&
    body != null &&
    "error" in body &&
    (body as { error: unknown }).error
  ) {
    throw new Error(formatAdsApiError(body));
  }
  return body as T;
}

/** Derive derived metrics from spend/impressions/clicks/revenue (pence). */
export function deriveMetrics(row: {
  spendPence: number;
  impressions: number;
  clicks: number;
  revenuePence: number;
}) {
  const cpm =
    row.impressions > 0 ? (row.spendPence / 100 / row.impressions) * 1000 : 0;
  const cpcPence = row.clicks > 0 ? Math.round(row.spendPence / row.clicks) : 0;
  const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
  const roas = row.spendPence > 0 ? row.revenuePence / row.spendPence : 0;
  return { cpm, cpcPence, ctr, roas };
}
