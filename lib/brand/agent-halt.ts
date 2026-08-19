import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** User-facing copy — keep in sync with Brand autonomy kill switch UI. */
export const BRAND_AGENT_HALT_MESSAGE =
  "Brand agent activity is paused (kill switch). All scheduled AI work and Claude spend are halted for this brand.";

export type BrandAgentHaltSkip = {
  skipped: true;
  reason: "agent_activity_paused";
  message: string;
};

export async function isBrandAgentHalted(params: {
  organizationId: string;
  brandId: string;
}): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("brands")
    .select("agent_activity_paused")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();
  return Boolean(data?.agent_activity_paused);
}

/** Returns a skip payload when halted; otherwise null (caller may proceed). */
export async function skipIfBrandAgentHalted(params: {
  organizationId: string;
  brandId: string;
}): Promise<BrandAgentHaltSkip | null> {
  if (await isBrandAgentHalted(params)) {
    return {
      skipped: true,
      reason: "agent_activity_paused",
      message: BRAND_AGENT_HALT_MESSAGE,
    };
  }
  return null;
}

/** Throws when the brand kill switch is on — use before any Claude/API agent work. */
export async function assertBrandAgentsActive(params: {
  organizationId: string;
  brandId: string;
}): Promise<void> {
  const skip = await skipIfBrandAgentHalted(params);
  if (skip) throw new Error(skip.message);
}

/** Brands eligible for scheduled Claude-consuming crons. */
export async function listBrandsWithAgentsActive(params?: {
  organizationId?: string;
  limit?: number;
}) {
  const supabase = createAdminClient();
  let query = supabase
    .from("brands")
    .select("id, organization_id, name")
    .eq("agent_activity_paused", false)
    .limit(params?.limit ?? 500);
  if (params?.organizationId) {
    query = query.eq("organization_id", params.organizationId);
  }
  const { data } = await query;
  return data ?? [];
}

/** Resolve brand_id from agent_run.input for sweeper / retry guards. */
export async function resolveBrandIdForAgentRun(params: {
  organizationId: string;
  agentName: string;
  input: Record<string, unknown> | null;
  researchProjectId?: string | null;
}): Promise<string | null> {
  const input = params.input ?? {};
  const direct = input.brandId ?? input.brand_id;
  if (typeof direct === "string" && direct.length > 0) return direct;

  if (params.researchProjectId) {
    const supabase = createAdminClient();
    const { data: project } = await supabase
      .from("research_projects")
      .select("brand_id")
      .eq("id", params.researchProjectId)
      .maybeSingle();
    if (project?.brand_id) return project.brand_id;
  }

  const mediaAssetId = input.mediaAssetId;
  if (typeof mediaAssetId === "string" && mediaAssetId.length > 0) {
    const supabase = createAdminClient();
    const { data: asset } = await supabase
      .from("media_assets")
      .select("brand_id")
      .eq("id", mediaAssetId)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (asset?.brand_id) return asset.brand_id;
  }

  return null;
}
