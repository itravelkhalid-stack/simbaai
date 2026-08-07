import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgAdLimits } from "@/lib/types/ads";

export async function loadEffectiveOrgAdLimits(params: {
  organizationId: string;
  brandId: string;
}): Promise<{
  max_daily_spend_pence: number;
  max_single_campaign_daily_budget_pence: number;
}> {
  const supabase = createAdminClient();
  const { data: limitRows } = await supabase
    .from("org_ad_limits")
    .select("*")
    .eq("organization_id", params.organizationId)
    .or(`brand_id.is.null,brand_id.eq.${params.brandId}`);

  const rows = (limitRows ?? []) as OrgAdLimits[];
  const org = rows.find((r) => r.brand_id == null);
  const brand = rows.find((r) => r.brand_id === params.brandId);
  if (!org) {
    throw new Error(
      "org_ad_limits row required before budget-only ads can run — set Ads → Settings limits first",
    );
  }
  return {
    max_daily_spend_pence: Math.min(
      org.max_daily_spend_pence,
      brand?.max_daily_spend_pence ?? org.max_daily_spend_pence,
    ),
    max_single_campaign_daily_budget_pence: Math.min(
      org.max_single_campaign_daily_budget_pence,
      brand?.max_single_campaign_daily_budget_pence ??
        org.max_single_campaign_daily_budget_pence,
    ),
  };
}
