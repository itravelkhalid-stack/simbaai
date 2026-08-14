import "server-only";

import { adsTable } from "@/lib/ads/db";
import type { SetupBlocker } from "@/lib/ads/meta-targeting";
import { createAdminClient } from "@/lib/supabase/admin";

export async function upsertAdsSetupBlocker(params: {
  organizationId: string;
  brandId: string;
  blocker: SetupBlocker;
}) {
  const supabase = createAdminClient();
  await adsTable(supabase, "ads_setup_blockers").upsert(
    {
      organization_id: params.organizationId,
      brand_id: params.brandId,
      code: params.blocker.code,
      title: params.blocker.title,
      body: params.blocker.body,
      severity: params.blocker.severity,
      blocks_conversion_optimisation: false,
      resolved_at: null,
    },
    { onConflict: "organization_id,brand_id,code" },
  );
}
