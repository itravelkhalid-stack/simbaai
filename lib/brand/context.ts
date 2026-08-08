import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildBrandContextMarkdown } from "@/lib/brand/markdown";
import type {
  Brand,
  BrandAudience,
  BrandProduct,
  Competitor,
} from "@/lib/types/research";
import type { ContentPillar } from "@/lib/types/content";
import {
  BRAND_ASSET_TAGS,
  type BrandAssetSlotUrls,
  type MediaAsset,
} from "@/lib/types/media";

export type { BrandAssetSlotUrls };

export type BrandContext = {
  organizationId: string;
  organizationName: string;
  brand: Brand;
  audiences: BrandAudience[];
  products: BrandProduct[];
  competitors: Competitor[];
  pillars: ContentPillar[];
  /** Reserved brand asset public URLs */
  assets: BrandAssetSlotUrls;
  /** Short digest from guidelines.summary or synthesized */
  guidelinesDigest: string;
  colorPalette: string[];
  markdown: string;
};

function pickTaggedUrl(assets: MediaAsset[], tag: string): string | null {
  return assets.find((a) => (a.tags ?? []).includes(tag))?.public_url ?? null;
}

function buildGuidelinesDigest(brand: Brand): string {
  const g = (brand.guidelines ?? {}) as Record<string, unknown>;
  if (typeof g.summary === "string" && g.summary.trim()) return g.summary.trim();

  const parts: string[] = [];
  if (typeof g.tone === "string" && g.tone) parts.push(`Tone: ${g.tone}`);
  const doSay = Array.isArray(g.do_say) ? (g.do_say as string[]) : [];
  const dontSay = Array.isArray(g.dont_say) ? (g.dont_say as string[]) : [];
  const valueProps = Array.isArray(g.value_props)
    ? (g.value_props as string[])
    : [];
  if (doSay.length) parts.push(`Prefer: ${doSay.slice(0, 6).join("; ")}`);
  if (dontSay.length) parts.push(`Avoid: ${dontSay.slice(0, 6).join("; ")}`);
  if (valueProps.length) {
    parts.push(`Value props: ${valueProps.slice(0, 4).join("; ")}`);
  }
  if (brand.brand_voice) parts.push(brand.brand_voice.slice(0, 400));
  return parts.join(" · ") || "No guidelines digest yet";
}

export async function getBrandContext(
  organizationId: string,
  brandId?: string,
  options?: { admin?: boolean },
): Promise<BrandContext> {
  const supabase = options?.admin ? createAdminClient() : await createClient();

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .single();
  if (orgError || !org) throw new Error(orgError?.message ?? "Organization not found");

  let brandQuery = supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId);

  if (brandId) {
    brandQuery = brandQuery.eq("id", brandId);
  } else {
    brandQuery = brandQuery.eq("is_primary", true);
  }

  const { data: brand, error: brandError } = await brandQuery.maybeSingle();
  if (brandError) throw new Error(brandError.message);

  let resolvedBrand = brand;
  if (!resolvedBrand) {
    const { data: fallback, error } = await supabase
      .from("brands")
      .select("*")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!fallback) throw new Error("No brand found for organization");
    resolvedBrand = fallback;
  }

  const [
    { data: audiences },
    { data: products },
    { data: competitors },
    { data: pillars },
    { data: mediaRows },
  ] = await Promise.all([
    supabase
      .from("brand_audiences")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("brand_id", resolvedBrand.id),
    supabase
      .from("brand_products")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("brand_id", resolvedBrand.id)
      .order("sort_order"),
    supabase
      .from("competitors")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("brand_id", resolvedBrand.id),
    supabase
      .from("content_pillars")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("brand_id", resolvedBrand.id)
      .order("name"),
    supabase
      .from("media_assets")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("brand_id", resolvedBrand.id)
      .overlaps("tags", Object.values(BRAND_ASSET_TAGS)),
  ]);

  const mediaAssets = (mediaRows ?? []) as MediaAsset[];
  const assets: BrandAssetSlotUrls = {
    logoPrimary:
      pickTaggedUrl(mediaAssets, BRAND_ASSET_TAGS.logoPrimary) ??
      (resolvedBrand as Brand).logo_url,
    logoSecondary: pickTaggedUrl(mediaAssets, BRAND_ASSET_TAGS.logoSecondary),
    logoDark: pickTaggedUrl(mediaAssets, BRAND_ASSET_TAGS.logoDark),
    logoLight: pickTaggedUrl(mediaAssets, BRAND_ASSET_TAGS.logoLight),
    guidelinesDoc: pickTaggedUrl(mediaAssets, BRAND_ASSET_TAGS.guidelinesDoc),
  };

  const brandTyped = {
    ...(resolvedBrand as Brand),
    allowed_link_urls: ((resolvedBrand as Brand).allowed_link_urls ??
      []) as string[],
  };
  const colorPalette = [
    brandTyped.primary_color,
    brandTyped.secondary_color,
    brandTyped.accent_color,
  ].filter((c): c is string => Boolean(c));

  const guidelinesDigest = buildGuidelinesDigest(brandTyped);

  const base = {
    organizationId,
    organizationName: org.name,
    brand: brandTyped,
    audiences: (audiences ?? []) as BrandAudience[],
    products: (products ?? []) as BrandProduct[],
    competitors: (competitors ?? []) as Competitor[],
    pillars: (pillars ?? []) as ContentPillar[],
    assets,
    guidelinesDigest,
    colorPalette,
  };

  return {
    ...base,
    markdown: buildBrandContextMarkdown(base),
  };
}
