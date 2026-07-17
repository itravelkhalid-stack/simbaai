import Link from "next/link";

import { AdsNav } from "@/components/ads/ads-nav";
import { MediaPlanForm } from "@/components/ads/media-plan-form";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdMediaPlan } from "@/lib/types/ads";
import { formatPence } from "@/lib/ads/metrics";

export default async function AdsPlansPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("ad_media_plans")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Media plans</h1>
        <p className="mt-2 text-muted-foreground">
          AI Ads Strategist builds platform split, structure, audiences, and creative
          requirements — approve before campaigns are created.
        </p>
      </div>
      <AdsNav current="/ads/plans" />
      <MediaPlanForm />
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as AdMediaPlan[]).length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No plans yet.</li>
        ) : (
          ((data ?? []) as AdMediaPlan[]).map((plan) => (
            <li key={plan.id} className="flex justify-between gap-3 p-4">
              <div>
                <Link href={`/ads/plans/${plan.id}`} className="font-medium underline">
                  {plan.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {plan.status} · {formatPence(plan.monthly_budget_pence, plan.currency)}
                  /mo
                  {plan.target_roas ? ` · ROAS ${plan.target_roas}x` : ""}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
