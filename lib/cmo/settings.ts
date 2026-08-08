import "server-only";

import {
  effectiveAutonomyMode,
  parseBrandAutonomy,
} from "@/lib/autonomy/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Brand } from "@/lib/types/research";

/** CMO owns content approvals when brand autonomy covers content or organic. */
export function isCmoEnabledForBrandRow(brand: {
  autonomy_mode?: string | null;
  channel_modes?: unknown;
  agent_activity_paused?: boolean | null;
}): boolean {
  if (brand.agent_activity_paused) return false;
  const settings = parseBrandAutonomy(brand as Brand);
  return (
    effectiveAutonomyMode(settings, "organic_social") === "autonomous" ||
    effectiveAutonomyMode(settings, "content") === "autonomous"
  );
}

export async function isCmoEnabledForBrand(params: {
  organizationId: string;
  brandId: string;
}): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("autonomy_mode, channel_modes, agent_activity_paused")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  if (!brand) return false;
  return isCmoEnabledForBrandRow(brand);
}

export const CMO_APPROVAL_LABEL = "Approved by CMO (Simba)";
