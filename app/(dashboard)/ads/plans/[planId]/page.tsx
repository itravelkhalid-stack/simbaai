import { notFound } from "next/navigation";

import { AdsNav } from "@/components/ads/ads-nav";
import { MediaPlanEditor } from "@/components/ads/media-plan-editor";
import { Button } from "@/components/ui/button";
import { createPlanCampaignsPaused } from "@/lib/ads/launch-actions";
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
  const typedPlan = plan as AdMediaPlan;
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("id, name, platform, status, platform_campaign_id")
    .eq("media_plan_id", planId)
    .eq("organization_id", active.organization_id)
    .order("created_at");
  const supported = (campaigns ?? []).filter(
    (campaign) => campaign.platform === "meta" || campaign.platform === "google",
  );
  const uncreated = supported.filter(
    (campaign) => !campaign.platform_campaign_id,
  );

  return (
    <div className="space-y-6">
      <div>
        <AdsNav current="/ads/plans" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          {typedPlan.name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {typedPlan.goal_brief}
        </p>
      </div>
      <MediaPlanEditor plan={typedPlan} />
      {typedPlan.status === "approved" ? (
        <section className="space-y-3 rounded-xl border p-4">
          <div>
            <h2 className="font-medium">Platform build pipeline</h2>
            <p className="text-sm text-muted-foreground">
              Generates every ready Meta/Google hierarchy PAUSED. Each campaign
              needs approved creative variants first.
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {supported.map((campaign) => (
              <li key={campaign.id}>
                {campaign.name} · {campaign.platform} ·{" "}
                {campaign.platform_campaign_id
                  ? `created (${campaign.platform_campaign_id})`
                  : "waiting to create"}
              </li>
            ))}
          </ul>
          {uncreated.length ? (
            <form action={createPlanCampaignsPaused}>
              <input type="hidden" name="planId" value={typedPlan.id} />
              <Button type="submit">Create campaigns PAUSED</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              All supported campaigns have been created. Review launch approvals
              under Creative approvals.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
