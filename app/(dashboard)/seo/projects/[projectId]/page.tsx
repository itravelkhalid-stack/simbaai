import { notFound } from "next/navigation";

import { SeoNav } from "@/components/seo/seo-nav";
import {
  runAuditNow,
  setGscSiteUrl,
  startGscOAuth,
  syncGscNow,
} from "@/lib/seo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { SeoProject } from "@/lib/types/seo";
import { listGscSites, getValidGscAccessToken } from "@/lib/seo/gsc";

function googleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export default async function SeoProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ gsc?: string }>;
}) {
  const { projectId } = await params;
  const q = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("seo_projects")
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!project) notFound();

  const p = project as SeoProject;
  const oauthReady = googleOAuthConfigured();
  let sites: Array<{ siteUrl: string }> = [];
  if (p.gsc_connected) {
    try {
      const token = await getValidGscAccessToken(p);
      sites = await listGscSites(token);
    } catch {
      sites = [];
    }
  }

  const [
    { count: keywords },
    { count: pages },
    { count: briefs },
    { count: articles },
  ] = await Promise.all([
    supabase
      .from("seo_keywords")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),
    supabase
      .from("seo_pages")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),
    supabase
      .from("seo_content_briefs")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),
    supabase
      .from("seo_articles")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{p.name}</h1>
        <p className="mt-2 text-muted-foreground">{p.domain}</p>
      </div>
      <SeoNav projectId={projectId} current={`/seo/projects/${projectId}`} />
      {q.gsc ? (
        <p className="text-sm text-muted-foreground">Google Search Console connected.</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Keywords", keywords ?? 0],
          ["Audited pages", pages ?? 0],
          ["Briefs", briefs ?? 0],
          ["Articles", articles ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border p-4">
        <p className="text-sm font-medium">Google Search Console</p>
        {p.gsc_connected && p.gsc_last_error ? (
          <div
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            role="alert"
          >
            <p className="font-medium text-destructive">GSC sync stopped</p>
            <p className="mt-1 text-muted-foreground">{p.gsc_last_error}</p>
            {oauthReady ? (
              <form action={startGscOAuth} className="mt-3">
                <input type="hidden" name="projectId" value={projectId} />
                <Button type="submit" size="sm" variant="destructive">
                  Reconnect Google Search Console
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
        {!p.gsc_connected ? (
          oauthReady ? (
            <form action={startGscOAuth}>
              <input type="hidden" name="projectId" value={projectId} />
              <Button type="submit">Connect GSC</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Google OAuth is not configured on the server (
              <code className="text-xs">GOOGLE_CLIENT_ID</code> /{" "}
              <code className="text-xs">GOOGLE_CLIENT_SECRET</code>).
            </p>
          )
        ) : (
          <div className="space-y-3">
            <form action={setGscSiteUrl} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="projectId" value={projectId} />
              <div className="space-y-2">
                <Label htmlFor="siteUrl">Property</Label>
                <select
                  id="siteUrl"
                  name="siteUrl"
                  defaultValue={p.gsc_site_url ?? ""}
                  className="h-9 min-w-[280px] rounded-lg border border-input bg-background px-2 text-sm"
                >
                  <option value="">Select site</option>
                  {sites.map((s) => (
                    <option key={s.siteUrl} value={s.siteUrl}>
                      {s.siteUrl}
                    </option>
                  ))}
                  {p.gsc_site_url &&
                  !sites.some((s) => s.siteUrl === p.gsc_site_url) ? (
                    <option value={p.gsc_site_url}>{p.gsc_site_url}</option>
                  ) : null}
                </select>
              </div>
              <Button type="submit" variant="outline" size="sm">
                Save property
              </Button>
            </form>
            <div className="flex flex-wrap gap-2">
              <form action={syncGscNow}>
                <input type="hidden" name="projectId" value={projectId} />
                <Button type="submit" size="sm">
                  Sync GSC now
                </Button>
              </form>
              <form action={runAuditNow}>
                <input type="hidden" name="projectId" value={projectId} />
                <Button type="submit" size="sm" variant="outline">
                  Run technical audit
                </Button>
              </form>
            </div>
            <p className="text-xs text-muted-foreground">
              Last GSC sync: {p.last_gsc_sync_at ?? "never"} · Last audit:{" "}
              {p.last_audit_at ?? "never"}
            </p>
          </div>
        )}
        {!p.gsc_connected ? (
          <div className="space-y-2">
            <Label htmlFor="manualSite">Or set site URL manually after connect</Label>
            <Input id="manualSite" disabled placeholder="sc-domain:example.com" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
