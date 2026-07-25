import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandGuidelinesView } from "@/components/brand/guidelines-view";
import { BrandNav } from "@/components/brand/brand-nav";
import { GuidelinesProposalPanel } from "@/components/brand/guidelines-proposal-panel";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand, BrandAudience, BrandProduct } from "@/lib/types/research";
import type { BrandGuidelinesProposal } from "@/lib/types/media";
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

  const [{ data: audiences }, { data: products }, { data: proposals }] =
    await Promise.all([
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
      supabase
        .from("brand_guidelines_proposals")
        .select("*")
        .eq("brand_id", brand.id)
        .eq("organization_id", active.organization_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Guidelines — {brand.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            The brand kit agents and humans share when creating work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/brand/media?brandId=${brand.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Media library
          </Link>
          <Link
            href={`/brand/setup?brandId=${brand.id}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Edit in wizard
          </Link>
        </div>
      </div>
      <BrandNav current="/brand/guidelines" />
      <GuidelinesProposalPanel
        proposals={(proposals ?? []) as BrandGuidelinesProposal[]}
        canWrite={canWrite}
      />
      <BrandGuidelinesView
        brand={brand as Brand}
        audiences={(audiences ?? []) as BrandAudience[]}
        products={(products ?? []) as BrandProduct[]}
      />
    </div>
  );
}
