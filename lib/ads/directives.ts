import "server-only";

import { writeAuditEvent } from "@/lib/compliance/audit";
import { adsTable } from "@/lib/ads/db";
import { createAdminClient } from "@/lib/supabase/admin";

/** Create a directive from Ask the Team / agent tooling (admin client). */
export async function createAdDirectiveFromAsk(params: {
  organizationId: string;
  brandId: string;
  userId: string | null;
  scope: "destination" | "area" | "hotel" | "open";
  title: string;
  focusText: string;
  destinationSlug?: string | null;
  budgetSharePct?: number | null;
  notes?: string | null;
}) {
  const supabase = createAdminClient();
  const { data, error } = await adsTable(supabase, "ad_campaign_directives")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      scope: params.scope,
      title: params.title,
      focus_text: params.focusText,
      destination_slug: params.destinationSlug ?? null,
      budget_share_pct: params.budgetSharePct ?? null,
      notes: params.notes ?? null,
      status: "active",
      created_by: params.userId,
      source: "ask_team",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: params.organizationId,
    actorUserId: params.userId,
    action: "ad_directive_create",
    entityType: "ad_directive",
    entityId: data.id,
    summary: `Ask-the-Team ad directive: ${params.title}`,
    after: params,
    meta: { source: "ask_team" },
  });
  return data.id as string;
}

export async function listActiveDirectives(params: {
  organizationId: string;
  brandId: string;
}): Promise<
  Array<{
    id: string;
    scope: string;
    title: string;
    focus_text: string;
    budget_share_pct: number | null;
    notes: string | null;
    destination_slug: string | null;
  }>
> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await adsTable(supabase, "ad_campaign_directives")
    .select(
      "id, scope, title, focus_text, budget_share_pct, notes, destination_slug",
    )
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("status", "active")
    .or(`starts_on.is.null,starts_on.lte.${today}`)
    .or(`ends_on.is.null,ends_on.gte.${today}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    scope: string;
    title: string;
    focus_text: string;
    budget_share_pct: number | null;
    notes: string | null;
    destination_slug: string | null;
  }>;
}
