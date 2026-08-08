/* eslint-disable @typescript-eslint/no-explicit-any */
import { AdsNav } from "@/components/ads/ads-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { evaluateDestinationBookingWindow } from "@/lib/ads/booking-window";
import { Button } from "@/components/ui/button";
import { refreshSeasonalityAction } from "@/lib/ads/seasonality-actions";

export default async function AdsSeasonalityPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const db = supabase as any;
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .eq("is_primary", true)
    .maybeSingle();

  const { data: seasonalityRows } = brand
    ? await db
        .from("destination_seasonality")
        .select("*")
        .eq("organization_id", active.organization_id)
        .eq("brand_id", brand.id)
        .order("destination_slug")
        .order("stay_month")
    : { data: [] as Array<Record<string, unknown>> };

  const rows = (seasonalityRows ?? []) as Array<{
    id: string;
    destination_slug: string;
    destination_name: string;
    stay_month: number;
    visit_attractiveness: "peak" | "shoulder" | "off";
    booking_lead_min_days: number;
    booking_lead_max_days: number;
  }>;

  const asOf = new Date();
  const byDest = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byDest.get(row.destination_slug) ?? [];
    list.push(row);
    byDest.set(row.destination_slug, list);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Destination seasonality
        </h1>
        <p className="mt-2 text-muted-foreground">
          Visit attractiveness + booking lead windows. Planner only advertises
          when now falls inside a booking window for peak/shoulder stay months.
        </p>
      </div>
      <AdsNav current="/ads/seasonality" />
      {brand ? (
        <form action={refreshSeasonalityAction}>
          <input type="hidden" name="brandId" value={brand.id} />
          <Button type="submit" size="sm">
            Run research refresh
          </Button>
        </form>
      ) : null}
      {[...byDest.entries()].map(([slug, destRows]) => (
        <section key={slug} className="space-y-2">
          <h2 className="text-lg font-medium capitalize">{slug}</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Month</th>
                  <th className="p-2">Attractiveness</th>
                  <th className="p-2">Lead days</th>
                  <th className="p-2">Admissible now?</th>
                </tr>
              </thead>
              <tbody>
                {(destRows ?? []).map((r) => {
                  const d = evaluateDestinationBookingWindow(
                    {
                      destination_slug: r.destination_slug,
                      destination_name: r.destination_name,
                      stay_month: r.stay_month,
                      visit_attractiveness: r.visit_attractiveness,
                      booking_lead_min_days: r.booking_lead_min_days,
                      booking_lead_max_days: r.booking_lead_max_days,
                    },
                    asOf,
                  );
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-2">{r.stay_month}</td>
                      <td className="p-2">{r.visit_attractiveness}</td>
                      <td className="p-2">
                        {r.booking_lead_min_days}–{r.booking_lead_max_days}
                      </td>
                      <td className="p-2">
                        {d.ok ? "yes" : "no"}{" "}
                        <span className="text-xs text-muted-foreground">
                          {d.reason}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!byDest.size ? (
        <p className="text-sm text-muted-foreground">
          No rows yet — run research refresh to seed Marmaris + research top
          destinations.
        </p>
      ) : null}
    </div>
  );
}
