/**
 * Hiring = activating a real AGENT_REGISTRY entry for a brand.
 * Always-on agents need no row. Hireable agents require status=active.
 */

import { AGENT_REGISTRY, getAgentById } from "@/lib/agents/registry";
import { createAdminClient } from "@/lib/supabase/admin";

/** Infrastructure / always available without an explicit hire row. */
export const ALWAYS_ON_AGENT_IDS = new Set([
  "content-cadence-fill",
  "daily-standup",
  "weekly-marketing",
  "chief-executive",
  "chief-marketing-officer",
  "social-publish-due",
  "analytics-rollup",
]);

/** Agents the CEO may propose hiring when a capability gap is found. */
export const HIREABLE_AGENT_IDS = new Set([
  "organic-growth",
  "content-batch-plan",
  "content-single",
  "email-campaign-generate",
  "email-flow-strategy",
  "ads-optimisation",
  "seo-weekly-summary",
  "crm-pipeline-review",
]);

export function isHireableAgentId(agentId: string) {
  return HIREABLE_AGENT_IDS.has(agentId) && Boolean(getAgentById(agentId));
}

export async function isRegistryAgentActiveForBrand(params: {
  organizationId: string;
  brandId: string;
  agentId: string;
}): Promise<boolean> {
  if (!getAgentById(params.agentId)) return false;
  if (ALWAYS_ON_AGENT_IDS.has(params.agentId)) return true;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("brand_agent_activations")
    .select("status")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("agent_id", params.agentId)
    .maybeSingle();

  return data?.status === "active";
}

export async function proposeOrActivateHire(params: {
  organizationId: string;
  brandId: string;
  agentId: string;
  mandate: string;
  reason: string;
  autonomyMode: "approval" | "autonomous";
  ceoCheckId?: string | null;
}): Promise<{
  agent_id: string;
  display_name: string;
  mandate: string;
  reason: string;
  status: "proposed" | "active" | "queued_approval";
} | null> {
  if (!isHireableAgentId(params.agentId)) return null;
  const entry = getAgentById(params.agentId);
  if (!entry) return null;

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("brand_agent_activations")
    .select("id, status")
    .eq("brand_id", params.brandId)
    .eq("agent_id", params.agentId)
    .maybeSingle();

  if (existing?.status === "active") return null;
  if (existing?.status === "proposed") {
    return {
      agent_id: params.agentId,
      display_name: entry.displayName,
      mandate: params.mandate,
      reason: params.reason,
      status: "queued_approval",
    };
  }

  const activateNow = params.autonomyMode === "autonomous";
  const status = activateNow ? "active" : "proposed";
  const now = new Date().toISOString();

  const payload = {
    organization_id: params.organizationId,
    brand_id: params.brandId,
    agent_id: params.agentId,
    status,
    mandate: params.mandate,
    proposed_by: "ceo",
    proposed_reason: params.reason,
    ceo_check_id: params.ceoCheckId ?? null,
    activated_at: activateNow ? now : null,
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("brand_agent_activations")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("brand_agent_activations")
      .insert(payload);
    if (error) throw new Error(error.message);
  }

  if (activateNow) {
    const { notifyOrgAdmins } = await import("@/lib/notifications/notify");
    await notifyOrgAdmins({
      organizationId: params.organizationId,
      title: `CEO hired ${entry.displayName}`,
      body: params.mandate,
      link: `/team`,
      category: "general",
    }).catch(() => undefined);
  } else {
    const { notifyApprovalsNeeded } = await import(
      "@/lib/notifications/notify"
    );
    await notifyApprovalsNeeded({
      organizationId: params.organizationId,
      title: `CEO proposes hiring ${entry.displayName}`,
      body: `${params.reason} — ${params.mandate}`,
      link: `/team?hire=${params.agentId}&brandId=${params.brandId}`,
    }).catch(() => undefined);
  }

  return {
    agent_id: params.agentId,
    display_name: entry.displayName,
    mandate: params.mandate,
    reason: params.reason,
    status: activateNow ? "active" : "queued_approval",
  };
}

export function listHireableRegistryAgents() {
  return AGENT_REGISTRY.filter((a) => HIREABLE_AGENT_IDS.has(a.id));
}
