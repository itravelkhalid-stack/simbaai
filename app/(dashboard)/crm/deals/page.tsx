import { CreateDealForm } from "@/components/crm/create-deal-form";
import { CrmNav } from "@/components/crm/crm-nav";
import { DealKanban } from "@/components/crm/deal-kanban";
import { ensureDefaultPipeline } from "@/lib/crm/contacts";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { CrmContact, CrmDeal } from "@/lib/types/crm";

export default async function CrmDealsPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", active.organization_id)
    .order("name");

  const brandId = params.brandId || brands?.[0]?.id;
  if (!brandId) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Deals</h1>
        <p className="text-sm text-muted-foreground">Create a brand first.</p>
      </div>
    );
  }

  const pipeline = await ensureDefaultPipeline(active.organization_id, brandId);

  const [{ data: deals }, { data: contacts }] = await Promise.all([
    supabase
      .from("crm_deals")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("pipeline_id", pipeline.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("crm_contacts")
      .select("id, email, name")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);

  const contactMap: Record<string, string> = {};
  for (const c of (contacts ?? []) as Pick<CrmContact, "id" | "email" | "name">[]) {
    contactMap[c.id] = c.name || c.email;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Deal board</h1>
        <p className="mt-2 text-muted-foreground">
          Drag deals between stages. Closed-won adds revenue to the contact.
        </p>
      </div>
      <CrmNav current="/crm/deals" />

      <div className="flex flex-wrap gap-2">
        {(brands ?? []).map((b) => (
          <a
            key={b.id}
            href={`/crm/deals?brandId=${b.id}`}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              b.id === brandId ? "bg-foreground text-background" : ""
            }`}
          >
            {b.name}
          </a>
        ))}
      </div>

      <CreateDealForm
        brandId={brandId}
        contacts={(contacts ?? []) as Pick<CrmContact, "id" | "email" | "name">[]}
        stages={pipeline.stages}
      />

      <DealKanban
        stages={pipeline.stages}
        deals={(deals ?? []) as CrmDeal[]}
        contactMap={contactMap}
      />
    </div>
  );
}
