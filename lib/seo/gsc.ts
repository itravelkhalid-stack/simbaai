import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SeoProject } from "@/lib/types/seo";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function googleClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET required for GSC");
  }
  return { clientId, clientSecret };
}

export function getGscAuthorizationUrl(input: {
  state: string;
  redirectUri: string;
}) {
  const { clientId } = googleClient();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GSC_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeGscCode(input: {
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
    throw new Error(json.error ?? "GSC token exchange failed");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
  };
}

async function refreshGscToken(refreshToken: string) {
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
    throw new Error(json.error ?? "GSC token refresh failed");
  }
  return {
    accessToken: json.access_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : null,
  };
}

export async function saveGscTokens(params: {
  projectId: string;
  organizationId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  siteUrl?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("seo_projects")
    .update({
      gsc_connected: true,
      gsc_access_token_encrypted: encryptSecret(params.accessToken),
      ...(params.refreshToken
        ? { gsc_refresh_token_encrypted: encryptSecret(params.refreshToken) }
        : {}),
      gsc_token_expires_at: params.expiresAt?.toISOString() ?? null,
      ...(params.siteUrl != null ? { gsc_site_url: params.siteUrl } : {}),
    })
    .eq("id", params.projectId)
    .eq("organization_id", params.organizationId);
  if (error) throw new Error(error.message);
}

export async function getValidGscAccessToken(
  project: SeoProject,
): Promise<string> {
  if (!project.gsc_access_token_encrypted) {
    throw new Error("GSC not connected");
  }
  const expires = project.gsc_token_expires_at
    ? new Date(project.gsc_token_expires_at).getTime()
    : 0;
  if (expires > Date.now() + 60_000) {
    return decryptSecret(project.gsc_access_token_encrypted);
  }
  if (!project.gsc_refresh_token_encrypted) {
    return decryptSecret(project.gsc_access_token_encrypted);
  }
  const refreshed = await refreshGscToken(
    decryptSecret(project.gsc_refresh_token_encrypted),
  );
  await saveGscTokens({
    projectId: project.id,
    organizationId: project.organization_id,
    accessToken: refreshed.accessToken,
    refreshToken: decryptSecret(project.gsc_refresh_token_encrypted),
    expiresAt: refreshed.expiresAt,
  });
  return refreshed.accessToken;
}

export async function listGscSites(accessToken: string) {
  const res = await fetch(
    "https://www.googleapis.com/webmasters/v3/sites",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const json = (await res.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to list GSC sites");
  return json.siteEntry ?? [];
}

export async function fetchGscSearchAnalytics(params: {
  accessToken: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  rowLimit?: number;
}) {
  const encoded = encodeURIComponent(params.siteUrl);
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encoded}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: params.startDate,
        endDate: params.endDate,
        dimensions: ["date", "query", "page"],
        rowLimit: params.rowLimit ?? 2500,
      }),
    },
  );
  const json = (await res.json()) as {
    rows?: Array<{
      keys: string[];
      clicks: number;
      impressions: number;
      ctr: number;
      position: number;
    }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(json.error?.message ?? "GSC searchAnalytics failed");
  }
  return json.rows ?? [];
}

export async function syncGscDailyForProject(project: SeoProject, days = 7) {
  if (!project.gsc_connected || !project.gsc_site_url) {
    return { synced: 0, reason: "not_connected" as const };
  }
  const accessToken = await getValidGscAccessToken(project);
  const end = new Date();
  end.setDate(end.getDate() - 2); // GSC lag
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const rows = await fetchGscSearchAnalytics({
    accessToken,
    siteUrl: project.gsc_site_url,
    startDate,
    endDate,
  });

  const supabase = createAdminClient();
  let synced = 0;
  for (const row of rows) {
    const [metricDate, query, page] = row.keys;
    const { error } = await supabase.from("seo_gsc_daily").upsert(
      {
        organization_id: project.organization_id,
        project_id: project.id,
        metric_date: metricDate,
        query: query ?? "",
        page: page ?? "",
        impressions: Math.round(row.impressions ?? 0),
        clicks: Math.round(row.clicks ?? 0),
        ctr: row.ctr ?? 0,
        position: row.position ?? 0,
      },
      { onConflict: "project_id,metric_date,query,page" },
    );
    if (!error) synced += 1;
  }

  // Update tracked keyword positions from latest GSC averages
  const { data: keywords } = await supabase
    .from("seo_keywords")
    .select("id, keyword, current_position")
    .eq("project_id", project.id)
    .eq("tracked", true);

  for (const kw of keywords ?? []) {
    const matching = rows.filter(
      (r) => (r.keys[1] ?? "").toLowerCase() === kw.keyword.toLowerCase(),
    );
    if (matching.length === 0) continue;
    const avg =
      matching.reduce((s, r) => s + r.position, 0) / matching.length;
    await supabase
      .from("seo_keywords")
      .update({
        previous_position: kw.current_position,
        current_position: Math.round(avg * 100) / 100,
      })
      .eq("id", kw.id);
  }

  await supabase
    .from("seo_projects")
    .update({ last_gsc_sync_at: new Date().toISOString() })
    .eq("id", project.id);

  return { synced, reason: "ok" as const };
}
