/**
 * Google Ads API REST helpers (no official client SDK).
 * API version pinned for stable REST paths.
 */

/**
 * Pinned API version. Google sunsets versions roughly yearly and a sunset
 * version answers with an HTML 404 page, so keep this current and allow an
 * env override to react without a code change.
 */
export const GOOGLE_ADS_API_VERSION =
  process.env.GOOGLE_ADS_API_VERSION?.trim() || "v25";

/** Parse a Google response body defensively — sunset/blocked endpoints return HTML. */
async function readGoogleJson<T>(res: Response, label: string): Promise<T> {
  const text = await res.text();
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    const contentType = res.headers.get("content-type") ?? "unknown";
    throw new Error(
      `${label} returned non-JSON (status ${res.status}, content-type ${contentType}). ` +
        `Check GOOGLE_ADS_API_VERSION (${GOOGLE_ADS_API_VERSION}) is not sunset. ` +
        `Body starts: ${text.slice(0, 160).replace(/\s+/g, " ")}`,
    );
  }
}

export function googleAdsDeveloperToken() {
  const token = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!token) {
    throw new Error(
      "GOOGLE_ADS_DEVELOPER_TOKEN is required for Google Ads API calls",
    );
  }
  return token;
}

export function googleAdsLoginCustomerId() {
  const raw = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.trim();
  if (!raw) return null;
  return raw.replace(/-/g, "");
}

export function normalizeGoogleAdsCustomerId(id: string) {
  return id.replace(/^customers\//, "").replace(/-/g, "");
}

/** cost_micros → minor currency units (pence/cents). 1 unit = 1e6 micros = 100 minor. */
export function microsToMinorUnits(micros: number | string) {
  const n = typeof micros === "string" ? Number(micros) : micros;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 10_000);
}

/** Google Ads conversions_value is in currency units (not micros). */
export function currencyUnitsToMinor(value: number | string) {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeGoogleOAuthCode(params: {
  code: string;
  redirectUri: string;
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET required");
  }

  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await readGoogleJson<GoogleTokenResponse>(
    res,
    "Google token exchange",
  );
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Google token exchange failed (${res.status})`,
    );
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scopes: json.scope?.split(" ").filter(Boolean) ?? [],
  };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date | null;
  refreshToken: string | null;
  scopes: string[];
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET required");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await readGoogleJson<GoogleTokenResponse>(
    res,
    "Google token refresh",
  );
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error_description ||
        json.error ||
        `Google token refresh failed (${res.status})`,
    );
  }

  return {
    accessToken: json.access_token,
    // Google often omits refresh_token on refresh — keep caller’s existing
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
    scopes: json.scope?.split(" ").filter(Boolean) ?? [],
  };
}

function googleAdsHeaders(params: {
  accessToken: string;
  loginCustomerId?: string | null;
}) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${params.accessToken}`,
    "developer-token": googleAdsDeveloperToken(),
    "Content-Type": "application/json",
  };
  const loginId =
    params.loginCustomerId ?? googleAdsLoginCustomerId() ?? undefined;
  if (loginId) {
    headers["login-customer-id"] = normalizeGoogleAdsCustomerId(loginId);
  }
  return headers;
}

export type GoogleAdsMutatePath =
  | "googleAds:mutate"
  | "campaignBudgets:mutate"
  | "campaigns:mutate"
  | "adGroups:mutate"
  | "adGroupAds:mutate";

/** Direct REST mutation helper used by the Phase C write provider. */
export async function googleAdsMutate<T>(params: {
  accessToken: string;
  customerId: string;
  loginCustomerId?: string | null;
  path: GoogleAdsMutatePath;
  body: Record<string, unknown>;
}): Promise<T> {
  const customerId = normalizeGoogleAdsCustomerId(params.customerId);
  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/${params.path}`,
    {
      method: "POST",
      headers: googleAdsHeaders({
        accessToken: params.accessToken,
        loginCustomerId: params.loginCustomerId,
      }),
      body: JSON.stringify(params.body),
    },
  );
  const json = await readGoogleJson<
    T & {
      error?: {
        message?: string;
        status?: string;
        details?: unknown;
      };
    }
  >(res, `Google Ads ${params.path}`);
  if (!res.ok) {
    const requestId = res.headers.get("request-id");
    throw new Error(
      `${json.error?.message ?? `Google Ads mutate failed (${res.status})`}${
        requestId ? ` [request-id: ${requestId}]` : ""
      }`,
    );
  }
  return json as T;
}

export async function listAccessibleCustomerIds(
  accessToken: string,
): Promise<string[]> {
  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
    {
      method: "GET",
      headers: googleAdsHeaders({ accessToken }),
    },
  );
  const json = await readGoogleJson<{
    resourceNames?: string[];
    error?: { message?: string; details?: unknown };
  }>(res, "listAccessibleCustomers");
  if (!res.ok) {
    throw new Error(
      json.error?.message ||
        `listAccessibleCustomers failed (${res.status}): ${JSON.stringify(json)}`,
    );
  }
  return (json.resourceNames ?? []).map((r) =>
    normalizeGoogleAdsCustomerId(r),
  );
}

type SearchStreamChunk = {
  results?: Array<{
    customer?: {
      id?: string;
      descriptiveName?: string;
      currencyCode?: string;
      timeZone?: string;
      manager?: boolean;
    };
    campaign?: { id?: string; name?: string };
    segments?: { date?: string };
    metrics?: {
      costMicros?: string;
      impressions?: string;
      clicks?: string;
      conversions?: number | string;
      conversionsValue?: number | string;
    };
  }>;
};

export async function googleAdsSearchStream(params: {
  accessToken: string;
  customerId: string;
  query: string;
  loginCustomerId?: string | null;
}): Promise<SearchStreamChunk["results"]> {
  const customerId = normalizeGoogleAdsCustomerId(params.customerId);
  const res = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: googleAdsHeaders({
        accessToken: params.accessToken,
        loginCustomerId: params.loginCustomerId,
      }),
      body: JSON.stringify({ query: params.query }),
    },
  );

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : [];
  } catch {
    throw new Error(
      `Google Ads searchStream returned non-JSON (status ${res.status}). ` +
        `Check GOOGLE_ADS_API_VERSION (${GOOGLE_ADS_API_VERSION}) is not sunset. ` +
        `Body starts: ${text.slice(0, 160).replace(/\s+/g, " ")}`,
    );
  }

  if (!res.ok) {
    throw new Error(
      `Google Ads searchStream ${res.status}: ${typeof parsed === "object" ? JSON.stringify(parsed) : text}`,
    );
  }

  // searchStream returns an array of chunks
  const chunks = Array.isArray(parsed)
    ? (parsed as SearchStreamChunk[])
    : [parsed as SearchStreamChunk];

  const results: NonNullable<SearchStreamChunk["results"]> = [];
  for (const chunk of chunks) {
    if (chunk.results?.length) results.push(...chunk.results);
  }
  return results;
}
