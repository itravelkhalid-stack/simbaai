import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandGuidelinesView } from "@/components/brand/guidelines-view";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand, BrandAudience, BrandProduct } from "@/lib/types/research";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function BrandGuidelinesPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const params = await searchParams;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

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

  const [{ data: audiences }, { data: products }] = await Promise.all([
    supabase
      .from("brand_audiences")
      .select("*")
      .eq("brand_id", brand.id)
      .order("name"),
    supabase
      .from("brand_products")
      .select("*")
      .eq("brand_id", brand.id)
      .order("sort_order"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/brand" className="text-sm text-muted-foreground underline">
            ← Brand
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Guidelines — {brand.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            The brand kit agents and humans share when creating work.
          </p>
        </div>
        <Link
          href={`/brand/setup?brandId=${brand.id}`}
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Edit in wizard
        </Link>
      </div>
      <BrandGuidelinesView
        brand={brand as Brand}
        audiences={(audiences ?? []) as BrandAudience[]}
        products={(products ?? []) as BrandProduct[]}
      />
    </div>
  );
}
