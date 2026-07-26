import { notFound } from "next/navigation";

import { BrandNav } from "@/components/brand/brand-nav";
import {
  BrandSetupWizard,
  type WizardStep,
} from "@/components/brand/setup-wizard";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand, BrandAudience, BrandProduct } from "@/lib/types/research";

const STEPS: WizardStep[] = [
  "basics",
  "visual",
  "voice",
  "audiences",
  "products",
];

export default async function BrandSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string; step?: string }>;
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

  const step = STEPS.includes(params.step as WizardStep)
    ? (params.step as WizardStep)
    : "basics";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Setup — {brand.name}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Basics, visual identity, voice, audiences, and products. Extract from a
          website URL anytime below.
        </p>
      </div>
      <BrandNav current="/brand/setup" />
      <BrandSetupWizard
        brand={brand as Brand}
        audiences={(audiences ?? []) as BrandAudience[]}
        products={(products ?? []) as BrandProduct[]}
        step={step}
      />
    </div>
  );
}
