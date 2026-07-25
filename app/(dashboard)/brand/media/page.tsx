import { notFound } from "next/navigation";

import { BrandAssetSlots } from "@/components/brand/brand-asset-slots";
import { BrandNav } from "@/components/brand/brand-nav";
import { MediaLibraryPanel } from "@/components/brand/media-library-panel";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types/research";
import type { MediaAsset } from "@/lib/types/media";

export default async function BrandMediaPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const canWrite = active.role !== "org_viewer";

  let brandQuery = supabase
    .from("brands")
    .select("*")
    .eq("organization_id", active.organization_id);

  if (params.brandId) {
    brandQuery = brandQuery.eq("id", params.brandId);
  } else {
    brandQuery = brandQuery.eq("is_primary", true);
  }

  let { data: brand } = await brandQuery.maybeSingle();
  if (!brand) {
    const { data: fallback } = await supabase
      .from("brands")
      .select("*")
      .eq("organization_id", active.organization_id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    brand = fallback;
  }
  if (!brand) notFound();

  const typedBrand = brand as Brand;
  const { data: assets } = await supabase
    .from("media_assets")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("brand_id", typedBrand.id)
    .order("created_at", { ascending: false });

  const list = (assets ?? []) as MediaAsset[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Media library</h1>
        <p className="mt-2 text-muted-foreground">
          Brand assets for {typedBrand.name}. Public URLs are used for Instagram
          publishing.
        </p>
      </div>
      <BrandNav current="/brand/media" />
      <BrandAssetSlots
        brandId={typedBrand.id}
        assets={list}
        canWrite={canWrite}
      />
      <MediaLibraryPanel
        brandId={typedBrand.id}
        assets={list}
        canWrite={canWrite}
      />
    </div>
  );
}
