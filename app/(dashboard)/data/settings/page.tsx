import { DataNav } from "@/components/data/data-nav";
import { Button } from "@/components/ui/button";
import {
  selectGa4Property,
  startGa4OAuth,
  syncGa4Now,
} from "@/lib/data/actions";
import {
  getValidGa4AccessToken,
  listGa4Properties,
} from "@/lib/data/ga4";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Ga4Connection } from "@/lib/types/analytics";

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

  let properties: Array<{
    propertyId: string;
    displayName: string;
    accountName: string;
  }> = [];
  if (connection && params.ga4 === "pick") {
    try {
      const token = await getValidGa4AccessToken(connection as Ga4Connection);
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
          Connect Google Analytics 4 to enrich daily rollups with sessions and
          conversions by source/medium.
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
          GA4 connected. Nightly sync pulls sessions, conversions, and
          source/medium into rollups.
        </p>
      ) : null}

      <section className="space-y-3 rounded-xl border p-4">
        <h2 className="text-sm font-medium">Google Analytics 4</h2>
        {connection ? (
          <div className="space-y-2 text-sm">
            <p>
              Property:{" "}
              <span className="font-medium">
                {connection.property_name ?? connection.property_id}
              </span>
            </p>
            <p className="text-muted-foreground">
              Status: {connection.status}
              {connection.last_sync_at
                ? ` · last sync ${new Date(connection.last_sync_at).toLocaleString()}`
                : ""}
            </p>
            {connection.last_error ? (
              <p className="text-destructive">{connection.last_error}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <form action={syncGa4Now}>
                <input type="hidden" name="brandId" value={brandId} />
                <Button type="submit" size="sm">
                  Sync now
                </Button>
              </form>
              <form action={startGa4OAuth}>
                <input type="hidden" name="brandId" value={brandId} />
                <Button type="submit" size="sm" variant="outline">
                  Reconnect
                </Button>
              </form>
            </div>
          </div>
        ) : (
          <form action={startGa4OAuth}>
            <input type="hidden" name="brandId" value={brandId} />
            <Button type="submit">Connect GA4</Button>
          </form>
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
                        connection?.property_id === p.propertyId
                          ? "default"
                          : "outline"
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
