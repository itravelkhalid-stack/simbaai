import { AdsNav } from "@/components/ads/ads-nav";
import {
  applyAdRecommendation,
  dismissAdRecommendation,
} from "@/lib/ads/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdRecommendation } from "@/lib/types/ads";

export default async function AdsRecommendationsPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ad_recommendations")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Recommendations</h1>
        <p className="mt-2 text-muted-foreground">
          Daily AI optimisation suggestions. Apply only after review — budget changes
          never auto-apply unless auto-optimise is enabled with a daily cap.
        </p>
      </div>
      <AdsNav current="/ads/recommendations" />
      <ul className="space-y-3">
        {((data ?? []) as AdRecommendation[]).length === 0 ? (
          <li className="rounded-xl border p-4 text-sm text-muted-foreground">
            No recommendations yet. Daily job runs at 08:00 UTC.
          </li>
        ) : (
          ((data ?? []) as AdRecommendation[]).map((rec) => (
            <li key={rec.id} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{rec.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {rec.recommendation_type} · {rec.status}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{rec.rationale}</p>
              {rec.status === "pending" ? (
                <div className="flex flex-wrap gap-2">
                  <form action={applyAdRecommendation}>
                    <input type="hidden" name="recommendationId" value={rec.id} />
                    <Button type="submit" size="sm">
                      Apply
                    </Button>
                  </form>
                  <form action={dismissAdRecommendation} className="flex gap-2">
                    <input type="hidden" name="recommendationId" value={rec.id} />
                    <Input
                      name="reason"
                      placeholder="Dismiss reason"
                      required
                      className="w-56"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      Dismiss
                    </Button>
                  </form>
                </div>
              ) : null}
              {rec.dismiss_reason ? (
                <p className="text-xs text-muted-foreground">
                  Note: {rec.dismiss_reason}
                </p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
