"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assertPlanAllows } from "@/lib/billing/plans";
import { extractBrandFromWebsite } from "@/lib/brand/extract";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  brandAudienceSchema,
  brandBasicsSchema,
  brandExtractSchema,
  brandProductSchema,
  brandVisualSchema,
  brandVoiceSchema,
} from "@/lib/validations/brand";

export type BrandActionResult = {
  error?: string;
  success?: string;
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify brand");
  }
  return ctx;
}

function normalizeHex(value?: string) {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  return v.startsWith("#") ? v : `#${v}`;
}

export async function createBrand(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const parsed = brandBasicsSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website") || "",
    tagline: formData.get("tagline") || "",
    positioning: formData.get("positioning") || "",
    target_audience: formData.get("target_audience") || "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const { active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "brands");

    const supabase = await createClient();
    const { count } = await supabase
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", active.organization_id);

    const { data, error } = await supabase
      .from("brands")
      .insert({
        organization_id: active.organization_id,
        name: parsed.data.name,
        website: parsed.data.website || null,
        tagline: parsed.data.tagline || null,
        positioning: parsed.data.positioning || null,
        target_audience: parsed.data.target_audience || null,
        is_primary: (count ?? 0) === 0,
      })
      .select("id")
      .single();

    if (error || !data) return { error: error?.message ?? "Failed to create brand" };
    revalidatePath("/brand");
    redirect(`/brand/setup?brandId=${data.id}&step=visual`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function saveBrandBasics(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const brandId = String(formData.get("brandId") ?? "");
  const parsed = brandBasicsSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website") || "",
    tagline: formData.get("tagline") || "",
    positioning: formData.get("positioning") || "",
    target_audience: formData.get("target_audience") || "",
  });
  if (!brandId || !parsed.success) {
    return { error: parsed.success ? "Missing brand" : parsed.error.issues[0]?.message };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const { error } = await supabase
      .from("brands")
      .update({
        name: parsed.data.name,
        website: parsed.data.website || null,
        tagline: parsed.data.tagline || null,
        positioning: parsed.data.positioning || null,
        target_audience: parsed.data.target_audience || null,
      })
      .eq("id", brandId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/brand");
    revalidatePath("/brand/setup");
    revalidatePath("/brand/guidelines");
    return { success: "Basics saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function saveBrandVisual(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const brandId = String(formData.get("brandId") ?? "");
  const parsed = brandVisualSchema.safeParse({
    logo_url: formData.get("logo_url") || "",
    primary_color: formData.get("primary_color") || "",
    secondary_color: formData.get("secondary_color") || "",
    accent_color: formData.get("accent_color") || "",
    font_heading: formData.get("font_heading") || "",
    font_body: formData.get("font_body") || "",
  });
  if (!brandId || !parsed.success) {
    return { error: parsed.success ? "Missing brand" : parsed.error.issues[0]?.message };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const { error } = await supabase
      .from("brands")
      .update({
        logo_url: parsed.data.logo_url || null,
        primary_color: normalizeHex(parsed.data.primary_color ?? undefined),
        secondary_color: normalizeHex(parsed.data.secondary_color ?? undefined),
        accent_color: normalizeHex(parsed.data.accent_color ?? undefined),
        font_heading: parsed.data.font_heading || null,
        font_body: parsed.data.font_body || null,
      })
      .eq("id", brandId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/brand");
    revalidatePath("/brand/setup");
    revalidatePath("/brand/guidelines");
    return { success: "Visual identity saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function saveBrandVoice(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const brandId = String(formData.get("brandId") ?? "");
  const parsed = brandVoiceSchema.safeParse({
    brand_voice: formData.get("brand_voice") || "",
    tone: formData.get("tone") || "",
    do_say: formData.get("do_say") || "",
    dont_say: formData.get("dont_say") || "",
  });
  if (!brandId || !parsed.success) {
    return { error: parsed.success ? "Missing brand" : parsed.error.issues[0]?.message };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("guidelines")
      .eq("id", brandId)
      .eq("organization_id", active.organization_id)
      .single();

    const splitLines = (s: string) =>
      s
        .split(/\n|,/)
        .map((x) => x.trim())
        .filter(Boolean);

    const guidelines = {
      ...((brand?.guidelines as Record<string, unknown>) ?? {}),
      tone: parsed.data.tone || null,
      do_say: splitLines(parsed.data.do_say ?? ""),
      dont_say: splitLines(parsed.data.dont_say ?? ""),
    };

    const { error } = await supabase
      .from("brands")
      .update({
        brand_voice: parsed.data.brand_voice || null,
        guidelines,
      })
      .eq("id", brandId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/brand");
    revalidatePath("/brand/setup");
    revalidatePath("/brand/guidelines");
    return { success: "Voice saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function upsertBrandAudience(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const brandId = String(formData.get("brandId") ?? "");
  const audienceId = String(formData.get("audienceId") ?? "");
  const parsed = brandAudienceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    messaging_angles: formData.get("messaging_angles") || "",
  });
  if (!brandId || !parsed.success) {
    return { error: parsed.success ? "Missing brand" : parsed.error.issues[0]?.message };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const angles = (parsed.data.messaging_angles ?? "")
      .split(/\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);

    if (audienceId) {
      const { error } = await supabase
        .from("brand_audiences")
        .update({
          name: parsed.data.name,
          description: parsed.data.description || null,
          messaging_angles: angles,
        })
        .eq("id", audienceId)
        .eq("organization_id", active.organization_id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("brand_audiences").insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        messaging_angles: angles,
      });
      if (error) return { error: error.message };
    }

    revalidatePath("/brand");
    revalidatePath("/brand/setup");
    revalidatePath("/brand/guidelines");
    return { success: audienceId ? "Audience updated" : "Audience added" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function deleteBrandAudience(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  if (!audienceId) return;
  const { active } = await assertCanWrite();
  const supabase = await createClient();
  await supabase
    .from("brand_audiences")
    .delete()
    .eq("id", audienceId)
    .eq("organization_id", active.organization_id);
  revalidatePath("/brand/setup");
  revalidatePath("/brand/guidelines");
}

export async function upsertBrandProduct(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const brandId = String(formData.get("brandId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  const parsed = brandProductSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || "",
    category: formData.get("category") || "",
    url: formData.get("url") || "",
    price_major: formData.get("price_major") || undefined,
  });
  if (!brandId || !parsed.success) {
    return { error: parsed.success ? "Missing brand" : parsed.error.issues[0]?.message };
  }

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const pricePence =
      parsed.data.price_major != null
        ? Math.round(parsed.data.price_major * 100)
        : null;

    if (productId) {
      const { error } = await supabase
        .from("brand_products")
        .update({
          name: parsed.data.name,
          description: parsed.data.description || null,
          category: parsed.data.category || null,
          url: parsed.data.url || null,
          price_pence: pricePence,
        })
        .eq("id", productId)
        .eq("organization_id", active.organization_id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("brand_products").insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        name: parsed.data.name,
        description: parsed.data.description || null,
        category: parsed.data.category || null,
        url: parsed.data.url || null,
        price_pence: pricePence,
      });
      if (error) return { error: error.message };
    }

    revalidatePath("/brand");
    revalidatePath("/brand/setup");
    revalidatePath("/brand/guidelines");
    return { success: productId ? "Product updated" : "Product added" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function deleteBrandProduct(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  if (!productId) return;
  const { active } = await assertCanWrite();
  const supabase = await createClient();
  await supabase
    .from("brand_products")
    .delete()
    .eq("id", productId)
    .eq("organization_id", active.organization_id);
  revalidatePath("/brand/setup");
  revalidatePath("/brand/guidelines");
}

export async function saveGuidelinesNotes(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const brandId = String(formData.get("brandId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const valueProps = String(formData.get("value_props") ?? "");
  if (!brandId) return { error: "Missing brand" };

  try {
    const { active } = await assertCanWrite();
    const supabase = await createClient();
    const { data: brand } = await supabase
      .from("brands")
      .select("guidelines")
      .eq("id", brandId)
      .eq("organization_id", active.organization_id)
      .single();

    const guidelines = {
      ...((brand?.guidelines as Record<string, unknown>) ?? {}),
      notes: notes || null,
      value_props: valueProps
        .split(/\n/)
        .map((x) => x.trim())
        .filter(Boolean),
    };

    const { error } = await supabase
      .from("brands")
      .update({ guidelines })
      .eq("id", brandId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/brand/guidelines");
    return { success: "Guidelines updated" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function extractBrandFromUrl(
  _prev: BrandActionResult,
  formData: FormData,
): Promise<BrandActionResult> {
  const brandId = String(formData.get("brandId") ?? "");
  const parsed = brandExtractSchema.safeParse({
    websiteUrl: formData.get("websiteUrl"),
  });
  if (!brandId || !parsed.success) {
    return {
      error: parsed.success
        ? "Missing brand"
        : (parsed.error.issues[0]?.message ?? "Invalid URL"),
    };
  }

  try {
    const { user, active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");

    await extractBrandFromWebsite({
      organizationId: active.organization_id,
      brandId,
      websiteUrl: parsed.data.websiteUrl,
      userId: user.id,
    });

    revalidatePath("/brand");
    revalidatePath("/brand/setup");
    revalidatePath("/brand/guidelines");
    return { success: "Brand extracted from website" };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Extraction failed",
    };
  }
}

export async function setPrimaryBrand(formData: FormData) {
  const brandId = String(formData.get("brandId") ?? "");
  if (!brandId) return;
  const { active } = await assertCanWrite();
  const supabase = await createClient();
  await supabase
    .from("brands")
    .update({ is_primary: false })
    .eq("organization_id", active.organization_id);
  await supabase
    .from("brands")
    .update({ is_primary: true })
    .eq("id", brandId)
    .eq("organization_id", active.organization_id);
  revalidatePath("/brand");
}
