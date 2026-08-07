import { DataNav } from "@/components/data/data-nav";
import { Button } from "@/components/ui/button";
import {
  saveGa4ConversionEvents,
  selectGa4Property,
  startGa4OAuth,
  syncGa4Now,
} from "@/lib/data/actions";
import {
  GA4_PURCHASE_LIKE_EVENTS,
  hasGa4RevenueTracking,
  resolveGa4IntentEvents,
  resolveGa4RevenueEvents,
} from "@/lib/data/ga4-conversion-events";
import {
  getValidGa4AccessToken,
  listGa4Properties,
} from "@/lib/data/ga4";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Ga4Connection } from "@/lib/types/analytics";

function googleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export default async function DataSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    brandId?: string;
    ga4?: string;
    error?: string;
  }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();
  const oauthReady = googleOAuthConfigured();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const brandId = params.brandId || brands?.[0]?.id;

  if (!brandId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Data settings</h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const { data: connection } = await supabase
    .from("ga4_connections")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("brand_id", brandId)
    .maybeSingle();

  const ga4 = connection as Ga4Connection | null;
  const revenueConfigured = ga4?.conversion_event_names ?? [];
  const intentConfigured = ga4?.intent_event_names ?? [];
  const discoveredEvents = ga4?.discovered_event_names ?? [];
  const revenueResolved = resolveGa4RevenueEvents({
    configured: revenueConfigured,
    discoveredEventNames: discoveredEvents,
  });
  const intentResolved = resolveGa4IntentEvents({
    configured: intentConfigured,
    revenueEvents: revenueResolved.events,
  });
  const revenueReady = hasGa4RevenueTracking({
    conversionEventNames: revenueConfigured,
    discoveredEventNames: discoveredEvents,
  });

  const eventOptions = [
    ...new Set([
      ...discoveredEvents,
      ...revenueConfigured,
      ...intentConfigured,
      ...GA4_PURCHASE_LIKE_EVENTS,
    ]),
  ].sort((a, b) => a.localeCompare(b));

  let properties: Array<{
    propertyId: string;
    displayName: string;
    accountName: string;
  }> = [];
  if (ga4 && params.ga4 === "pick") {
    try {
      const token = await getValidGa4AccessToken(ga4);
      properties = await listGa4Properties(token);
    } catch {
      properties = [];
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Data settings</h1>
        <p className="mt-2 text-muted-foreground">
          Connect Google Analytics 4 to enrich daily rollups with sessions,
          revenue conversions, and intent proxies by source/medium.
        </p>
      </div>
      <DataNav current="/data/settings" />

      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/data/settings?brandId=${b.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
      </div>

      {params.error ? (
        <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          {params.error}
        </p>
      ) : null}
      {params.ga4 === "connected" ? (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          GA4 connected. Nightly sync pulls sessions and your selected conversion
          events into rollups.
        </p>
      ) : null}

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-sm font-medium">Google Analytics 4</h2>
        {ga4 ? (
          <div className="space-y-2 text-sm">
            <p>
              Property:{" "}
              <span className="font-medium">
                {ga4.property_name ?? ga4.property_id}
              </span>
            </p>
            <p className="text-muted-foreground">
              Status: {ga4.status}
              {ga4.last_sync_at
                ? ` · last sync ${new Date(ga4.last_sync_at).toLocaleString()}`
                : ""}
            </p>
            {ga4.last_error ? (
              <p className="text-destructive">{ga4.last_error}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <form action={syncGa4Now}>
                <input type="hidden" name="brandId" value={brandId} />
                <Button type="submit" size="sm">
                  Sync now
                </Button>
              </form>
              {oauthReady ? (
                <form action={startGa4OAuth}>
                  <input type="hidden" name="brandId" value={brandId} />
                  <Button type="submit" size="sm" variant="outline">
                    Reconnect
                  </Button>
                </form>
              ) : null}
            </div>
          </div>
        ) : oauthReady ? (
          <form action={startGa4OAuth}>
            <input type="hidden" name="brandId" value={brandId} />
            <Button type="submit">Connect GA4</Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Google OAuth is not configured on the server (
            <code className="text-xs">GOOGLE_CLIENT_ID</code> /{" "}
            <code className="text-xs">GOOGLE_CLIENT_SECRET</code>).
          </p>
        )}

        {properties.length > 1 ? (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Choose property</p>
            <ul className="space-y-2">
              {properties.map((p) => (
                <li key={p.propertyId}>
                  <form action={selectGa4Property}>
                    <input type="hidden" name="brandId" value={brandId} />
                    <input
                      type="hidden"
                      name="propertyId"
                      value={p.propertyId}
                    />
                    <input
                      type="hidden"
                      name="propertyName"
                      value={p.displayName}
                    />
                    <Button
                      type="submit"
                      variant={
                        ga4?.property_id === p.propertyId ? "default" : "outline"
                      }
                      size="sm"
                      className="w-full justify-start"
                    >
                      {p.displayName}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.accountName}
                      </span>
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {ga4 ? (
        <section className="space-y-4 rounded-xl border p-4">
          <div>
            <h2 className="text-sm font-medium">GA4 tracking events</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Separate revenue conversions (purchase/booking) from
              engagement/intent proxies (e.g. form_start). Proxies must never
              drive ROAS, CPA, or revenue attribution.
            </p>
          </div>

          {!revenueReady ? (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              Setup blocker: GA4 purchase/revenue tracking is not configured.
              Implement a purchase/booking event on the site, mark it as a key
              event in GA4, then select it below under Revenue conversions.
            </p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Active:{" "}
            <span className="font-medium text-foreground">
              revenue{" "}
              {revenueResolved.mode === "configured"
                ? `(${revenueResolved.events.join(", ")})`
                : revenueResolved.mode === "purchase_like_auto"
                  ? `auto (${revenueResolved.events.join(", ")})`
                  : "(not configured)"}
              {" · "}
              intent{" "}
              {intentResolved.mode === "configured"
                ? `(${intentResolved.events.join(", ")})`
                : "(none)"}
            </span>
          </p>

          {eventOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Run Sync now once to discover event names from this property.
            </p>
          ) : (
            <form action={saveGa4ConversionEvents} className="space-y-4">
              <input type="hidden" name="brandId" value={brandId} />
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Revenue conversions</h3>
                <p className="text-xs text-muted-foreground">
                  Purchase / booking / checkout-complete. Leave empty to
                  auto-detect purchase-like events when they appear.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {eventOptions.map((name) => (
                    <li key={`rev-${name}`}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="revenueEvent"
                          value={name}
                          defaultChecked={revenueConfigured.includes(name)}
                        />
                        <span>
                          {name}
                          {GA4_PURCHASE_LIKE_EVENTS.includes(
                            name as (typeof GA4_PURCHASE_LIKE_EVENTS)[number],
                          ) ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (purchase-like)
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="space-y-2 border-t pt-3">
                <h3 className="text-sm font-medium">
                  Engagement / intent proxies
                </h3>
                <p className="text-xs text-muted-foreground">
                  Counts as intent leads only. Not revenue — agents must label
                  these as proxies and must not compute ROAS/CPA from them.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {eventOptions.map((name) => (
                    <li key={`intent-${name}`}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="intentEvent"
                          value={name}
                          defaultChecked={intentConfigured.includes(name)}
                        />
                        <span>{name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm">
                  Save tracking events
                </Button>
                <p className="self-center text-xs text-muted-foreground">
                  Re-sync after changing. An event in both lists counts as
                  revenue only.
                </p>
              </div>
            </form>
          )}
        </section>
      ) : null}

      <section className="rounded-xl border p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Jobs</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Nightly rollup 04:30 UTC — GA4 sync then rebuild{" "}
            <code>analytics_daily</code>
          </li>
          <li>Anomaly detection 06:00 UTC — notifications feed + AI context</li>
        </ul>
      </section>
    </div>
  );
}
