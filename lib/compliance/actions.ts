"use server";

import { revalidatePath } from "next/cache";

import { writeAuditEvent } from "@/lib/compliance/audit";
import {
  cancelOrganizationDeletion,
  requestOrganizationDeletion,
} from "@/lib/compliance/deletion";
import { getOrCreateComplianceProfile } from "@/lib/compliance/check";
import { getPresetPack } from "@/lib/compliance/presets";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  ComplianceIndustryPreset,
  ComplianceRule,
} from "@/lib/types/compliance";

export type ComplianceActionResult = {
  error?: string;
  success?: string;
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify compliance settings");
  }
  return ctx;
}

async function assertOrgAdmin() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role !== "org_owner" && ctx.active.role !== "org_admin") {
    throw new Error("Only org admins can perform this action");
  }
  return ctx;
}

function parseList(raw: string) {
  return raw
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function upsertComplianceProfile(
  _prev: ComplianceActionResult,
  formData: FormData,
): Promise<ComplianceActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    if (!brandId) return { error: "Brand required" };

    const industry = String(
      formData.get("industry") ?? "general_ecommerce",
    ) as ComplianceIndustryPreset;
    const jurisdictions = parseList(String(formData.get("jurisdictions") ?? ""));
    const regulated = formData.get("regulated") === "on" || formData.get("regulated") === "true";
    const required_disclaimers = parseList(
      String(formData.get("required_disclaimers") ?? ""),
    );
    const banned_claims = parseList(String(formData.get("banned_claims") ?? ""));
    const banned_terms = parseList(String(formData.get("banned_terms") ?? ""));
    const approved_claims = parseList(
      String(formData.get("approved_claims") ?? ""),
    );
    const terms_urls = parseList(String(formData.get("terms_urls") ?? ""));

    let rules: ComplianceRule[] = [];
    const rulesRaw = String(formData.get("rules_json") ?? "").trim();
    if (rulesRaw) {
      try {
        rules = JSON.parse(rulesRaw) as ComplianceRule[];
      } catch {
        return { error: "Invalid rules JSON" };
      }
    } else {
      rules = getPresetPack(
        industry === "custom" ? "general_ecommerce" : industry,
      ).rules;
    }

    const supabase = await createClient();
    const before = await getOrCreateComplianceProfile({
      organizationId: active.organization_id,
      brandId,
    });

    const { error } = await supabase.from("compliance_profiles").upsert(
      {
        organization_id: active.organization_id,
        brand_id: brandId,
        industry,
        jurisdictions,
        regulated,
        rules,
        required_disclaimers,
        banned_claims,
        banned_terms,
        approved_claims,
        terms_urls,
      },
      { onConflict: "brand_id" },
    );
    if (error) return { error: error.message };

    await writeAuditEvent({
      organizationId: active.organization_id,
      actorUserId: user.id,
      action: "settings_change",
      entityType: "compliance_profile",
      entityId: brandId,
      summary: `Updated compliance profile (${industry})`,
      before: {
        industry: before.industry,
        regulated: before.regulated,
        jurisdictions: before.jurisdictions,
      },
      after: { industry, regulated, jurisdictions },
    });

    revalidatePath("/compliance");
    revalidatePath("/compliance/profile");
    return { success: "Compliance profile saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function applyIndustryPreset(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const brandId = String(formData.get("brandId") ?? "");
  const industry = String(
    formData.get("industry") ?? "general_ecommerce",
  ) as ComplianceIndustryPreset;
  if (!brandId) throw new Error("Brand required");

  const pack = getPresetPack(industry);
  const supabase = await createClient();
  const { error } = await supabase.from("compliance_profiles").upsert(
    {
      organization_id: active.organization_id,
      brand_id: brandId,
      industry: pack.industry,
      jurisdictions: pack.jurisdictions,
      regulated: pack.regulated,
      rules: pack.rules,
      required_disclaimers: pack.required_disclaimers,
      banned_claims: pack.banned_claims,
      banned_terms: pack.banned_terms,
      approved_claims: pack.approved_claims,
      terms_urls: pack.terms_urls,
    },
    { onConflict: "brand_id" },
  );
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "settings_change",
    entityType: "compliance_profile",
    entityId: brandId,
    summary: `Applied industry preset: ${industry}`,
    after: { industry },
  });

  revalidatePath("/compliance");
  revalidatePath("/compliance/profile");
}

export async function requestOrgDeletionAction(formData: FormData) {
  const { user, active } = await assertOrgAdmin();
  const confirm = String(formData.get("confirm") ?? "");
  if (confirm !== active.organization.slug && confirm !== "DELETE") {
    throw new Error("Type the organization slug or DELETE to confirm");
  }
  await requestOrganizationDeletion({
    organizationId: active.organization_id,
    userId: user.id,
  });
  revalidatePath("/compliance/data");
}

export async function cancelOrgDeletionAction() {
  const { user, active } = await assertOrgAdmin();
  await cancelOrganizationDeletion({
    organizationId: active.organization_id,
    userId: user.id,
  });
  revalidatePath("/compliance/data");
}

export async function recheckEntity(formData: FormData) {
  const { active } = await assertCanWrite();
  const entityType = String(formData.get("entityType") ?? "") as
    | "content"
    | "ad"
    | "email"
    | "seo_article";
  const entityId = String(formData.get("entityId") ?? "");
  const brandId = String(formData.get("brandId") ?? "");
  if (!entityType || !entityId || !brandId) throw new Error("Missing fields");

  const { runEntityComplianceCheck } = await import("@/lib/compliance/check");
  const supabase = await createClient();

  let title: string | null = null;
  let body = "";
  let extra: Record<string, unknown> = {};

  if (entityType === "content") {
    const { data } = await supabase
      .from("content_items")
      .select("title, copy, hashtags, structured, platform, format")
      .eq("id", entityId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!data) throw new Error("Content not found");
    title = data.title;
    body = data.copy;
    extra = {
      hashtags: data.hashtags,
      structured: data.structured,
      platform: data.platform,
      format: data.format,
    };
  } else if (entityType === "ad") {
    const { data } = await supabase
      .from("ad_creatives")
      .select("headline, primary_text, description, hook, cta")
      .eq("id", entityId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!data) throw new Error("Creative not found");
    title = data.headline;
    body = [data.primary_text, data.description, data.hook, data.cta]
      .filter(Boolean)
      .join("\n");
  } else if (entityType === "email") {
    const { data } = await supabase
      .from("email_campaigns")
      .select("name, subject, html_content, plain_text")
      .eq("id", entityId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!data) throw new Error("Campaign not found");
    title = data.subject ?? data.name;
    body = data.plain_text || data.html_content || "";
  } else {
    const { data } = await supabase
      .from("seo_articles")
      .select("title, content_markdown")
      .eq("id", entityId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!data) throw new Error("Article not found");
    title = data.title;
    body = data.content_markdown ?? "";
  }

  await runEntityComplianceCheck({
    organizationId: active.organization_id,
    brandId,
    entityType,
    entityId,
    title,
    body,
    extra,
    syncContentFlags: entityType === "content",
  });

  revalidatePath("/compliance");
  if (entityType === "content") revalidatePath(`/content/${entityId}`);
  if (entityType === "ad") revalidatePath("/ads/approvals");
  if (entityType === "seo_article") revalidatePath(`/seo/articles/${entityId}`);
  if (entityType === "email") revalidatePath(`/email/campaigns/${entityId}`);
}
