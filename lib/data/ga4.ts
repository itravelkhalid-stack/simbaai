import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Ga4Connection } from "@/lib/types/analytics";

const GA4_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/analytics.manage.users.readonly",
].join(" ");

function googleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET required for GA4");
  }
  return { clientId, clientSecret };
}

export function getGa4AuthorizationUrl(input: {
  state: string;
  redirectUri: string;
}) {
  const { clientId } = googleClient();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GA4_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeGa4Code(input: {
  code: string;
  redirectUri: string;
}) {
  const { clientId, clientSecret } = googleClient();
  const body = new URLSearchParams({
    code: input.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? "GA4 token exchange failed");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
  };
}

async function refreshGa4Token(refreshToken: string) {
  const { clientId, clientSecret } = googleClient();
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
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error ?? "GA4 token refresh failed");
  }
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
  };
}

export async function saveGa4Connection(params: {
  organizationId: string;
  brandId: string;
  propertyId: string;
  propertyName?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase.from("ga4_connections").upsert(
    {
      organization_id: params.organizationId,
      brand_id: params.brandId,
      property_id: params.propertyId.replace(/^properties\//, ""),
      property_name: params.propertyName ?? null,
      access_token_encrypted: encryptSecret(params.accessToken),
      ...(params.refreshToken
        ? { refresh_token_encrypted: encryptSecret(params.refreshToken) }
        : {}),
      token_expires_at: params.expiresAt?.toISOString() ?? null,
      status: "active",
      last_error: null,
    },
    { onConflict: "brand_id" },
  );
  if (error) throw new Error(error.message);
}

export async function getValidGa4AccessToken(
  connection: Ga4Connection,
): Promise<string> {
  const expires = connection.token_expires_at
    ? new Date(connection.token_expires_at).getTime()
    : 0;
  if (expires > Date.now() + 60_000) {
    return decryptSecret(connection.access_token_encrypted);
  }
  if (!connection.refresh_token_encrypted) {
    return decryptSecret(connection.access_token_encrypted);
  }
  const refreshed = await refreshGa4Token(
    decryptSecret(connection.refresh_token_encrypted),
  );
  await saveGa4Connection({
    organizationId: connection.organization_id,
    brandId: connection.brand_id,
    propertyId: connection.property_id,
    propertyName: connection.property_name,
    accessToken: refreshed.accessToken,
    refreshToken: decryptSecret(connection.refresh_token_encrypted),
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

export type Ga4PropertySummary = {
  propertyId: string;
  displayName: string;
  accountName: string;
};

export async function listGa4Properties(
  accessToken: string,
): Promise<Ga4PropertySummary[]> {
  const res = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = (await res.json()) as {
    accountSummaries?: Array<{
      displayName?: string;
      propertySummaries?: Array<{
        property?: string;
        displayName?: string;
      }>;
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "Failed to list GA4 properties");
  }
  const out: Ga4PropertySummary[] = [];
  for (const account of json.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      if (!prop.property) continue;
      out.push({
        propertyId: prop.property.replace(/^properties\//, ""),
        displayName: prop.displayName ?? prop.property,
        accountName: account.displayName ?? "",
      });
    }
  }
  return out;
}

type Ga4ReportRow = {
  metric_date: string;
  source: string;
  medium: string;
  sessions: number;
  conversions: number;
};

async function runGa4Report(params: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
}): Promise<Ga4ReportRow[]> {
  const property = params.propertyId.replace(/^properties\//, "");
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
        dimensions: [
          { name: "date" },
          { name: "sessionSource" },
          { name: "sessionMedium" },
        ],
        metrics: [{ name: "sessions" }, { name: "conversions" }],
        limit: 10000,
      }),
    },
  );
  const json = (await res.json()) as {
    rows?: Array<{
      dimensionValues?: Array<{ value?: string }>;
      metricValues?: Array<{ value?: string }>;
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "GA4 report failed");
  }

  return (json.rows ?? []).map((row) => {
    const dims = row.dimensionValues ?? [];
    const metrics = row.metricValues ?? [];
    const rawDate = dims[0]?.value ?? "";
    const metric_date =
      rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;
    return {
      metric_date,
      source: dims[1]?.value || "(direct)",
      medium: dims[2]?.value || "(none)",
      sessions: Number(metrics[0]?.value ?? 0),
      conversions: Number(metrics[1]?.value ?? 0),
    };
  });
}

export async function syncGa4Connection(
  connection: Ga4Connection,
  daysBack = 14,
) {
  const supabase = createAdminClient();
  try {
    const accessToken = await getValidGa4AccessToken(connection);
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - daysBack);
    const rows = await runGa4Report({
      accessToken,
      propertyId: connection.property_id,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    });

    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from("analytics_ga4_daily").upsert(
        chunk.map((r) => ({
          organization_id: connection.organization_id,
          brand_id: connection.brand_id,
          metric_date: r.metric_date,
          source: r.source,
          medium: r.medium,
          sessions: r.sessions,
          conversions: r.conversions,
        })),
        { onConflict: "brand_id,metric_date,source,medium" },
      );
      if (error) throw new Error(error.message);
    }

    await supabase
      .from("ga4_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
        status: "active",
      })
      .eq("id", connection.id);

    return { rows: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "GA4 sync failed";
    await supabase
      .from("ga4_connections")
      .update({ last_error: message, status: "error" })
      .eq("id", connection.id);
    throw err;
  }
}

export async function syncAllGa4Connections(daysBack = 14) {
  const supabase = createAdminClient();
  const { data: connections } = await supabase
    .from("ga4_connections")
    .select("*")
    .eq("status", "active")
    .limit(200);

  let synced = 0;
  const errors: string[] = [];
  for (const c of (connections ?? []) as Ga4Connection[]) {
    try {
      await syncGa4Connection(c, daysBack);
      synced += 1;
    } catch (err) {
      errors.push(
        `${c.brand_id}: ${err instanceof Error ? err.message : "failed"}`,
      );
    }
  }
  return { synced, errors };
}
