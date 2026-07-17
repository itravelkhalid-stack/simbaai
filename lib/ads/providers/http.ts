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
    const message =
      typeof body === "object" && body && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : text || res.statusText;
    throw new Error(`Ads API ${res.status}: ${message}`);
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
