import { notFound } from "next/navigation";

import { AdsNav } from "@/components/ads/ads-nav";
import { MediaPlanEditor } from "@/components/ads/media-plan-editor";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AdMediaPlan } from "@/lib/types/ads";

export default async function AdsPlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("ad_media_plans")
    .select("*")
    .eq("id", planId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!plan) notFound();

  return (
    <div className="space-y-6">
      <div>
        <AdsNav current="/ads/plans" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {(plan as AdMediaPlan).name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {(plan as AdMediaPlan).goal_brief}
        </p>
      </div>
      <MediaPlanEditor plan={plan as AdMediaPlan} />
    </div>
  );
}
