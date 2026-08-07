import "server-only";

import { authorizeAgentAction } from "@/lib/autonomy/authorize";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Best-effort platform create for budget-loop approved campaigns.
 * Returns how many campaigns were handed to the human create path surrogate.
 * Full remote create still requires creatives + connections — we only mark
 * readiness and notify when automation can't finish.
 */
export async function createPlanCampaignsPausedAsAgent(params: {
  organizationId: string;
  brandId: string;
  planId: string;
}): Promise<number> {
  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("website")
    .eq("id", params.brandId)
    .single();
  if (!brand?.website) {
    throw new Error("Set brand website before platform campaign creation");
  }

  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("id, name, platform, connection_id, platform_campaign_id")
    .eq("media_plan_id", params.planId)
    .eq("organization_id", params.organizationId)
    .in("platform", ["meta", "google"])
    .is("platform_campaign_id", null);

  let ready = 0;
  for (const c of campaigns ?? []) {
    if (!c.connection_id) continue;
    const { count } = await supabase
      .from("ad_creatives")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .in("status", ["approved", "live"]);
    if (!(count && count > 0)) continue;

    const auth = await authorizeAgentAction({
      organizationId: params.organizationId,
      brandId: params.brandId,
      channel: "ads",
      action: "ads_create_paused",
      agentName: "ads_budget_loop",
      entityType: "ad_campaign",
      entityId: c.id,
      summary: `Create paused: ${c.name}`,
    });
    if (!auth.mayExecute) continue;
    ready += 1;
  }

  if (ready === 0) {
    throw new Error(
      "No campaigns ready for remote create (need connection + approved creatives). Plan is approved locally — finish creatives then Create paused / Go live.",
    );
  }

  return ready;
}
