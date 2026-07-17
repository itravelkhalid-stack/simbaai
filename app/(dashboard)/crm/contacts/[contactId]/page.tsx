import Link from "next/link";

import { ContactDetailPanels } from "@/components/crm/contact-detail-panels";
import { CrmNav } from "@/components/crm/crm-nav";
import { ensureDefaultPipeline } from "@/lib/crm/contacts";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  CrmActivity,
  CrmContact,
  CrmDeal,
} from "@/lib/types/crm";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ contactId: string }>;
}) {
  const { contactId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("*")
    .eq("id", contactId)
    .eq("organization_id", active.organization_id)
    .single();

  if (!contact) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">Contact not found.</p>
        <Link href="/crm/contacts" className="underline">
          Back
        </Link>
      </div>
    );
  }

  const c = contact as CrmContact;
  const pipeline = await ensureDefaultPipeline(
    active.organization_id,
    c.brand_id,
  );

  const [{ data: activities }, { data: deals }] = await Promise.all([
    supabase
      .from("crm_activities")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("crm_deals")
      .select("*")
      .eq("contact_id", contactId)
      .order("updated_at", { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/crm/contacts" className="text-sm text-muted-foreground underline">
          ← Contacts
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {c.name || c.email}
        </h1>
      </div>
      <CrmNav current="/crm/contacts" />
      <ContactDetailPanels
        contact={c}
        activities={(activities ?? []) as CrmActivity[]}
        deals={(deals ?? []) as CrmDeal[]}
        stages={pipeline.stages}
      />
    </div>
  );
}
