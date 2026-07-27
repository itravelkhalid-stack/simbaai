import Link from "next/link";

import { CreateContactForm } from "@/components/crm/create-contact-form";
import { EmptyState } from "@/components/brand/empty-state";
import { CrmNav } from "@/components/crm/crm-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_STAGES,
  type CrmContact,
  type CrmLifecycleStage,
} from "@/lib/types/crm";
import { fieldInputClass, fieldSelectClass } from "@/lib/ui/field";

export default async function CrmContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string; tag?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("crm_contacts")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (params.stage && LIFECYCLE_STAGES.includes(params.stage as CrmLifecycleStage)) {
    query = query.eq("lifecycle_stage", params.stage as CrmLifecycleStage);
  }
  if (params.q) {
    query = query.or(
      `email.ilike.%${params.q}%,name.ilike.%${params.q}%,company.ilike.%${params.q}%`,
    );
  }
  if (params.tag) {
    query = query.contains("tags", [params.tag]);
  }

  const [{ data: contacts }, { data: brands }] = await Promise.all([
    query,
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", active.organization_id)
      .order("name"),
  ]);

  const brandMap = new Map((brands ?? []).map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Contacts</h1>
        <p className="mt-2 text-muted-foreground">
          Filter by lifecycle stage, search, or tag. Sync from email lists anytime.
        </p>
      </div>
      <CrmNav current="/crm/contacts" />
      <CreateContactForm brands={brands ?? []} />

      <form className="flex flex-wrap gap-2 rounded-xl border p-3">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search email, name, company…"
          className={`${fieldInputClass} min-w-[200px] flex-1`}
        />
        <select
          name="stage"
          defaultValue={params.stage ?? ""}
          className={fieldSelectClass}
        >
          <option value="">All stages</option>
          {LIFECYCLE_STAGES.map((s) => (
            <option key={s} value={s}>
              {LIFECYCLE_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          name="tag"
          defaultValue={params.tag ?? ""}
          placeholder="Tag"
          className={`${fieldInputClass} w-32`}
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
        >
          Filter
        </button>
      </form>

      {((contacts ?? []) as CrmContact[]).length === 0 ? (
        <EmptyState
          title="Build a healthier pipeline"
          description="Add a contact or sync your email subscribers to begin tracking relationships, revenue, and follow-ups."
        />
      ) : (
        <div className="rounded-lg bg-card shadow-elevated ring-1 ring-border">
          <ul className="divide-y">
            {((contacts ?? []) as CrmContact[]).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <Link
                    href={`/crm/contacts/${c.id}`}
                    className="font-medium underline"
                  >
                    {c.name || c.email}
                  </Link>
                  <p className="text-muted-foreground">
                    {c.email} · {LIFECYCLE_LABELS[c.lifecycle_stage]} ·{" "}
                    {brandMap.get(c.brand_id) ?? "Brand"}
                    {c.lead_score != null ? ` · score ${c.lead_score}` : ""}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  £{(c.total_revenue_pence / 100).toFixed(0)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
