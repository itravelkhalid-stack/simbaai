import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  resolveGa4IntentEvents,
  resolveGa4RevenueEvents,
} from "@/lib/data/ga4-conversion-events";
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

type Ga4SessionsRow = {
  metric_date: string;
  source: string;
  medium: string;
  sessions: number;
};

type Ga4EventCountRow = {
  metric_date: string;
  source: string;
  medium: string;
  eventName: string;
  eventCount: number;
};

function parseGa4Date(raw: string) {
  return raw.length === 8
    ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
    : raw;
}

async function runGa4JsonReport(params: {
  accessToken: string;
  propertyId: string;
  body: Record<string, unknown>;
}) {
  const property = params.propertyId.replace(/^properties\//, "");
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.body),
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
  return json.rows ?? [];
}

async function runGa4SessionsReport(params: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
}): Promise<Ga4SessionsRow[]> {
  const rows = await runGa4JsonReport({
    accessToken: params.accessToken,
    propertyId: params.propertyId,
    body: {
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      dimensions: [
        { name: "date" },
        { name: "sessionSource" },
        { name: "sessionMedium" },
      ],
      metrics: [{ name: "sessions" }],
      limit: 10000,
    },
  });

  return rows.map((row) => {
    const dims = row.dimensionValues ?? [];
    return {
      metric_date: parseGa4Date(dims[0]?.value ?? ""),
      source: dims[1]?.value || "(direct)",
      medium: dims[2]?.value || "(none)",
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
    };
  });
}

async function runGa4EventBreakdown(params: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
}): Promise<Array<{ eventName: string; eventCount: number; keyEventCount: number }>> {
  const rows = await runGa4JsonReport({
    accessToken: params.accessToken,
    propertyId: params.propertyId,
    body: {
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }, { name: "conversions" }],
      orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
      limit: 200,
    },
  });

  return rows.map((row) => ({
    eventName: row.dimensionValues?.[0]?.value ?? "(unknown)",
    eventCount: Number(row.metricValues?.[0]?.value ?? 0),
    keyEventCount: Number(row.metricValues?.[1]?.value ?? 0),
  }));
}

async function runGa4EventCountsBySource(params: {
  accessToken: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  eventNames: string[];
}): Promise<Ga4EventCountRow[]> {
  if (params.eventNames.length === 0) return [];

  const rows = await runGa4JsonReport({
    accessToken: params.accessToken,
    propertyId: params.propertyId,
    body: {
      dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
      dimensions: [
        { name: "date" },
        { name: "sessionSource" },
        { name: "sessionMedium" },
        { name: "eventName" },
      ],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: {
            values: params.eventNames,
            caseSensitive: false,
          },
        },
      },
      limit: 10000,
    },
  });

  return rows.map((row) => {
    const dims = row.dimensionValues ?? [];
    return {
      metric_date: parseGa4Date(dims[0]?.value ?? ""),
      source: dims[1]?.value || "(direct)",
      medium: dims[2]?.value || "(none)",
      eventName: dims[3]?.value ?? "",
      eventCount: Number(row.metricValues?.[0]?.value ?? 0),
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
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const [sessionRows, eventBreakdown] = await Promise.all([
      runGa4SessionsReport({
        accessToken,
        propertyId: connection.property_id,
        startDate,
        endDate,
      }),
      runGa4EventBreakdown({
        accessToken,
        propertyId: connection.property_id,
        startDate,
        endDate,
      }),
    ]);

    const discovered = eventBreakdown.map((e) => e.eventName);
    const revenue = resolveGa4RevenueEvents({
      configured: connection.conversion_event_names ?? [],
      discoveredEventNames: discovered,
    });
    const intent = resolveGa4IntentEvents({
      configured: connection.intent_event_names ?? [],
      revenueEvents: revenue.events,
    });

    const trackedEvents = [...new Set([...revenue.events, ...intent.events])];
    const eventRows = await runGa4EventCountsBySource({
      accessToken,
      propertyId: connection.property_id,
      startDate,
      endDate,
      eventNames: trackedEvents,
    });

    const revenueNames = new Set(revenue.events.map((e) => e.toLowerCase()));
    const intentNames = new Set(intent.events.map((e) => e.toLowerCase()));
    const conversionByKey = new Map<string, number>();
    const intentByKey = new Map<string, number>();
    for (const row of eventRows) {
      const key = `${row.metric_date}|${row.source}|${row.medium}`;
      const name = row.eventName.toLowerCase();
      if (revenueNames.has(name)) {
        conversionByKey.set(
          key,
          (conversionByKey.get(key) ?? 0) + row.eventCount,
        );
      }
      if (intentNames.has(name)) {
        intentByKey.set(key, (intentByKey.get(key) ?? 0) + row.eventCount);
      }
    }

    const merged = new Map<
      string,
      {
        metric_date: string;
        source: string;
        medium: string;
        sessions: number;
        conversions: number;
        intent_events: number;
      }
    >();

    const ensureRow = (
      key: string,
      parts: { metric_date: string; source: string; medium: string },
    ) => {
      let row = merged.get(key);
      if (!row) {
        row = {
          metric_date: parts.metric_date,
          source: parts.source,
          medium: parts.medium,
          sessions: 0,
          conversions: 0,
          intent_events: 0,
        };
        merged.set(key, row);
      }
      return row;
    };

    for (const row of sessionRows) {
      const key = `${row.metric_date}|${row.source}|${row.medium}`;
      const out = ensureRow(key, row);
      out.sessions = row.sessions;
      out.conversions = conversionByKey.get(key) ?? 0;
      out.intent_events = intentByKey.get(key) ?? 0;
    }

    for (const [key, conversions] of conversionByKey) {
      const [metric_date, source, medium] = key.split("|");
      const out = ensureRow(key, { metric_date, source, medium });
      out.conversions = conversions;
      if (!intentByKey.has(key)) {
        out.intent_events = out.intent_events || 0;
      }
    }

    for (const [key, intentCount] of intentByKey) {
      const [metric_date, source, medium] = key.split("|");
      const out = ensureRow(key, { metric_date, source, medium });
      out.intent_events = intentCount;
      if (!conversionByKey.has(key)) {
        out.conversions = out.conversions || 0;
      }
    }

    const rows = [...merged.values()];

    // Replace prior window rows so stale totals don't linger.
    await supabase
      .from("analytics_ga4_daily")
      .delete()
      .eq("brand_id", connection.brand_id)
      .gte("metric_date", startDate)
      .lte("metric_date", endDate);

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
          intent_events: r.intent_events,
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
        discovered_event_names: discovered,
      })
      .eq("id", connection.id);

    return {
      rows: rows.length,
      revenueEvents: revenue.events,
      revenueMode: revenue.mode,
      intentEvents: intent.events,
      intentMode: intent.mode,
      discoveredEvents: discovered.length,
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "GA4 sync failed";
    const { humanizeGoogleOAuthError } = await import(
      "@/lib/integrations/google-oauth-errors"
    );
    const message = humanizeGoogleOAuthError(raw);
    await supabase
      .from("ga4_connections")
      .update({ last_error: message, status: "error" })
      .eq("id", connection.id);
    throw new Error(message);
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
