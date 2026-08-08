"use server";

import { revalidatePath } from "next/cache";
import { writeAuditEvent } from "@/lib/compliance/audit";
import { requireActiveOrg } from "@/lib/org/require";
import { adsTable } from "@/lib/ads/db";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const directiveSchema = z.object({
  brandId: z.string().uuid(),
  scope: z.enum(["destination", "area", "hotel", "open"]),
  title: z.string().min(2).max(160),
  focusText: z.string().min(2).max(500),
  destinationSlug: z.string().max(120).optional().nullable(),
  areaText: z.string().max(200).optional().nullable(),
  hotelName: z.string().max(200).optional().nullable(),
  budgetSharePct: z.number().positive().max(100).optional().nullable(),
  startsOn: z.string().optional().nullable(),
  endsOn: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export type DirectiveActionResult = { error?: string; success?: string; id?: string };

async function assertCanWriteAds() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot edit ad directives");
  }
  return ctx;
}

export async function createAdDirective(
  _prev: DirectiveActionResult,
  formData: FormData,
): Promise<DirectiveActionResult> {
  try {
    const { user, active } = await assertCanWriteAds();
    const budgetRaw = formData.get("budgetSharePct");
    const parsed = directiveSchema.safeParse({
      brandId: formData.get("brandId"),
      scope: formData.get("scope"),
      title: formData.get("title"),
      focusText: formData.get("focusText"),
      destinationSlug: formData.get("destinationSlug") || null,
      areaText: formData.get("areaText") || null,
      hotelName: formData.get("hotelName") || null,
      budgetSharePct:
        budgetRaw && String(budgetRaw).trim()
          ? Number(budgetRaw)
          : null,
      startsOn: formData.get("startsOn") || null,
      endsOn: formData.get("endsOn") || null,
      notes: formData.get("notes") || null,
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid directive" };
    }

    const supabase = await createClient();
    const { data, error } = await adsTable(supabase, "ad_campaign_directives")
      .insert({
        organization_id: active.organization_id,
        brand_id: parsed.data.brandId,
        scope: parsed.data.scope,
        title: parsed.data.title,
        focus_text: parsed.data.focusText,
        destination_slug: parsed.data.destinationSlug,
        area_text: parsed.data.areaText,
        hotel_name: parsed.data.hotelName,
        budget_share_pct: parsed.data.budgetSharePct,
        starts_on: parsed.data.startsOn || null,
        ends_on: parsed.data.endsOn || null,
        notes: parsed.data.notes,
        status: "active",
        created_by: user.id,
        source: "ui",
      })
      .select("id")
      .single();
    if (error) return { error: error.message };

    await writeAuditEvent({
      organizationId: active.organization_id,
      actorUserId: user.id,
      action: "ad_directive_create",
      entityType: "ad_directive",
      entityId: data.id,
      summary: `Created ad directive: ${parsed.data.title}`,
      after: parsed.data,
    });

    revalidatePath("/ads/directives");
    revalidatePath("/ads/plans");
    return { success: "Directive created", id: data.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed" };
  }
}

export async function setAdDirectiveStatus(formData: FormData) {
  const { user, active } = await assertCanWriteAds();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !["active", "paused", "completed", "cancelled"].includes(status)) {
    throw new Error("Invalid status");
  }
  const supabase = await createClient();
  const { error } = await adsTable(supabase, "ad_campaign_directives")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "ad_directive_status",
    entityType: "ad_directive",
    entityId: id,
    summary: `Ad directive → ${status}`,
    after: { status },
  });
  revalidatePath("/ads/directives");
}
