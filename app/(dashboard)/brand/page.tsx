import Link from "next/link";

import { BrandNav } from "@/components/brand/brand-nav";
import { EmptyState } from "@/components/brand/empty-state";
import { CreateBrandForm } from "@/components/brand/setup-wizard";
import { setPrimaryBrand } from "@/lib/brand/actions";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types/research";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function BrandPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: brands, error } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("is_primary", { ascending: false })
    .order("name");
  if (error) throw new Error(error.message);

  const list = (brands ?? []) as Brand[];
  const canWrite = active.role !== "org_viewer";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Brand"
        description="Brand kit, voice, audiences, products, media, and AI extraction."
        actions={
          list[0] ? (
            <>
              <Link href={`/brand/setup?brandId=${list[0].id}`} className={cn(buttonVariants())}>
                Setup wizard
              </Link>
              <Link
                href={`/brand/media?brandId=${list[0].id}`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Media
              </Link>
              <Link
                href="/brand/autonomy"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Autonomy
              </Link>
              <Link
                href={`/brand/guidelines?brandId=${list[0].id}`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Guidelines
              </Link>
            </>
          ) : null
        }
      />

      <BrandNav current="/brand" />

      {list.length === 0 ? (
        canWrite ? (
          <CreateBrandForm />
        ) : (
          <EmptyState
            title="Your brand kit starts here"
            description="Ask an owner or admin to create your brand, then your AI marketing team can work from its voice, audience, and guidelines."
          />
        )
      ) : (
        <ul className="space-y-3">
          {list.map((brand) => (
            <li
              key={brand.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{brand.name}</p>
                  {brand.is_primary ? <Badge>Primary</Badge> : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {brand.tagline || brand.website || "No tagline yet"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/brand/setup?brandId=${brand.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Edit
                </Link>
                <Link
                  href={`/brand/media?brandId=${brand.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Media
                </Link>
                <Link
                  href={`/brand/guidelines?brandId=${brand.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  Guidelines
                </Link>
                {!brand.is_primary && canWrite ? (
                  <form action={setPrimaryBrand}>
                    <input type="hidden" name="brandId" value={brand.id} />
                    <Button type="submit" size="sm" variant="ghost">
                      Make primary
                    </Button>
                  </form>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.length > 0 && canWrite ? (
        <div className="border-t pt-6">
          <CreateBrandForm />
        </div>
      ) : null}
    </div>
  );
}
