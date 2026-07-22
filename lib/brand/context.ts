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

export type BrandContext = {
  organizationId: string;
  organizationName: string;
  brand: Brand;
  audiences: BrandAudience[];
  products: BrandProduct[];
  competitors: Competitor[];
  pillars: ContentPillar[];
  markdown: string;
};

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

  const [{ data: audiences }, { data: products }, { data: competitors }, { data: pillars }] =
    await Promise.all([
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
    ]);

  const base = {
    organizationId,
    organizationName: org.name,
    brand: resolvedBrand as Brand,
    audiences: (audiences ?? []) as BrandAudience[],
    products: (products ?? []) as BrandProduct[],
    competitors: (competitors ?? []) as Competitor[],
    pillars: (pillars ?? []) as ContentPillar[],
  };

  return {
    ...base,
    markdown: buildBrandContextMarkdown(base),
  };
}
