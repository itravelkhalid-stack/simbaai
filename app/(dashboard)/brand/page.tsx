import Link from "next/link";

import { CreateBrandForm } from "@/components/brand/setup-wizard";
import { setPrimaryBrand } from "@/lib/brand/actions";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/types/research";
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Brand</h1>
          <p className="mt-2 text-muted-foreground">
            Brand kit, voice, audiences, products, and AI extraction from your site.
          </p>
        </div>
        {list[0] ? (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/brand/setup?brandId=${list[0].id}`}
              className={cn(buttonVariants())}
            >
              Setup wizard
            </Link>
            <Link
              href={`/brand/guidelines?brandId=${list[0].id}`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Guidelines
            </Link>
          </div>
        ) : null}
      </div>

      {list.length === 0 ? (
        canWrite ? (
          <CreateBrandForm />
        ) : (
          <p className="text-muted-foreground">No brands yet.</p>
        )
      ) : (
        <ul className="space-y-3">
          {list.map((brand) => (
            <li
              key={brand.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
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
