"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { writeAuditEvent } from "@/lib/compliance/audit";
import {
  clearImpersonateOrganizationId,
  isPlatformAdminUser,
  setActiveOrganizationId,
  setImpersonateOrganizationId,
} from "@/lib/org/session";
import { requireUser } from "@/lib/org/require";
import { parseFormData, uuidSchema } from "@/lib/security/validate";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_ORG_PLANS } from "@/lib/billing/plan-limit-error";
import type { OrgPlan } from "@/lib/types/database";

const PLANS: OrgPlan[] = ALL_ORG_PLANS;

async function assertPlatformAdmin() {
  const { user } = await requireUser();
  const ok = await isPlatformAdminUser(user.id);
  if (!ok) throw new Error("Platform admin only");
  return user;
}

export async function startImpersonation(formData: FormData) {
  const user = await assertPlatformAdmin();
  const { organizationId } = parseFormData(
    z.object({ organizationId: uuidSchema }),
    formData,
  );

  const admin = createAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("id", organizationId)
    .single();
  if (!org) throw new Error("Org not found");

  await setImpersonateOrganizationId(organizationId);
  await setActiveOrganizationId(organizationId);

  await writeAuditEvent({
    organizationId,
    actorUserId: user.id,
    action: "impersonation_start",
    entityType: "organization",
    entityId: organizationId,
    summary: `Platform admin started support mode for ${org.name}`,
    meta: { org_slug: org.slug },
  });

  revalidatePath("/");
  redirect("/");
}

export async function stopImpersonation() {
  const user = await assertPlatformAdmin();
  const { getImpersonateOrganizationId } = await import("@/lib/org/session");
  const orgId = await getImpersonateOrganizationId();
  await clearImpersonateOrganizationId();

  if (orgId) {
    await writeAuditEvent({
      organizationId: orgId,
      actorUserId: user.id,
      action: "impersonation_end",
      entityType: "organization",
      entityId: orgId,
      summary: "Platform admin ended support mode",
    });
  }

  revalidatePath("/");
  redirect("/admin");
}

export async function setOrgFeatureFlag(formData: FormData) {
  const user = await assertPlatformAdmin();
  const parsed = parseFormData(
    z.object({
      organizationId: uuidSchema,
      flagKey: z.string().min(1).max(100),
      enabled: z.string().optional(),
    }),
    formData,
  );
  const enabled = parsed.enabled === "on" || parsed.enabled === "true";

  const admin = createAdminClient();
  await admin.from("org_feature_flags").upsert(
    {
      organization_id: parsed.organizationId,
      flag_key: parsed.flagKey,
      enabled,
      updated_by: user.id,
    },
    { onConflict: "organization_id,flag_key" },
  );

  await writeAuditEvent({
    organizationId: parsed.organizationId,
    actorUserId: user.id,
    action: "settings_change",
    entityType: "org_feature_flag",
    entityId: parsed.flagKey,
    summary: `Feature flag ${parsed.flagKey} → ${enabled}`,
  });

  revalidatePath(`/admin/orgs/${parsed.organizationId}`);
}

export async function createAnnouncement(formData: FormData) {
  const user = await assertPlatformAdmin();
  const { title, body, severity } = parseFormData(
    z.object({
      title: z.string().trim().min(1).max(200),
      body: z.string().trim().min(1).max(5000),
      severity: z.string().trim().min(1).max(40).default("info"),
    }),
    formData,
  );

  const admin = createAdminClient();
  await admin.from("platform_announcements").insert({
    title,
    body,
    severity,
    active: true,
    created_by: user.id,
  });
  revalidatePath("/admin/announcements");
  revalidatePath("/");
}

export async function deactivateAnnouncement(formData: FormData) {
  await assertPlatformAdmin();
  const { id } = parseFormData(z.object({ id: uuidSchema }), formData);
  const admin = createAdminClient();
  await admin
    .from("platform_announcements")
    .update({ active: false, ends_at: new Date().toISOString() })
    .eq("id", id);
  revalidatePath("/admin/announcements");
  revalidatePath("/");
}

export async function setOrgPlan(formData: FormData) {
  const user = await assertPlatformAdmin();
  const { organizationId, plan: raw } = parseFormData(
    z.object({
      organizationId: uuidSchema,
      plan: z.string().min(1),
    }),
    formData,
  );
  const plan = (PLANS.includes(raw as OrgPlan) ? raw : "free") as OrgPlan;
  const admin = createAdminClient();
  await admin
    .from("organizations")
    .update({ plan })
    .eq("id", organizationId);
  await writeAuditEvent({
    organizationId,
    actorUserId: user.id,
    action: "settings_change",
    entityType: "organization",
    entityId: organizationId,
    summary: `Plan set to ${plan} by platform admin`,
  });
  revalidatePath("/admin");
  revalidatePath(`/admin/orgs/${organizationId}`);
}
