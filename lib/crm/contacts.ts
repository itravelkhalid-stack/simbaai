import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_PIPELINE_STAGES,
  type CrmContact,
  type CrmLifecycleStage,
  type CrmPipeline,
} from "@/lib/types/crm";

export async function ensureDefaultPipeline(
  organizationId: string,
  brandId: string,
): Promise<CrmPipeline> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("crm_pipelines")
    .select("*")
    .eq("brand_id", brandId)
    .eq("is_default", true)
    .maybeSingle();
  if (existing) return existing as CrmPipeline;

  const { data, error } = await supabase
    .from("crm_pipelines")
    .insert({
      organization_id: organizationId,
      brand_id: brandId,
      name: "Sales pipeline",
      stages: DEFAULT_PIPELINE_STAGES,
      is_default: true,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Pipeline create failed");
  return data as CrmPipeline;
}

export async function logCrmActivity(params: {
  organizationId: string;
  contactId: string;
  type: import("@/lib/types/crm").CrmActivityType;
  content: string;
  userId?: string | null;
  dealId?: string | null;
  meta?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  await supabase.from("crm_activities").insert({
    organization_id: params.organizationId,
    contact_id: params.contactId,
    deal_id: params.dealId ?? null,
    type: params.type,
    content: params.content,
    user_id: params.userId ?? null,
    meta: params.meta ?? {},
  });
  await supabase
    .from("crm_contacts")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", params.contactId);
}

export async function upsertCrmContact(params: {
  organizationId: string;
  brandId: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  source?: string | null;
  tags?: string[];
  customFields?: Record<string, unknown>;
  lifecycleStage?: CrmLifecycleStage;
  emailSubscriberId?: string | null;
  revenueDeltaPence?: number;
}): Promise<CrmContact> {
  const supabase = createAdminClient();
  const email = params.email.trim().toLowerCase();
  if (!email.includes("@")) throw new Error("Invalid email");

  const { data: existing } = await supabase
    .from("crm_contacts")
    .select("*")
    .eq("brand_id", params.brandId)
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    const tags = [
      ...new Set([...(existing.tags ?? []), ...(params.tags ?? [])]),
    ];
    const revenue =
      (existing.total_revenue_pence ?? 0) + (params.revenueDeltaPence ?? 0);
    let stage = existing.lifecycle_stage as CrmLifecycleStage;
    if (params.lifecycleStage) stage = params.lifecycleStage;
    else if (revenue > 0 && (stage === "subscriber" || stage === "lead" || stage === "mql" || stage === "sql")) {
      stage = "customer";
    } else if (revenue > (existing.total_revenue_pence ?? 0) && stage === "customer") {
      stage = "repeat";
    }

    const { data, error } = await supabase
      .from("crm_contacts")
      .update({
        name: params.name ?? existing.name,
        phone: params.phone ?? existing.phone,
        company: params.company ?? existing.company,
        source: params.source ?? existing.source,
        tags,
        custom_fields: {
          ...(existing.custom_fields as Record<string, unknown>),
          ...(params.customFields ?? {}),
        },
        lifecycle_stage: stage,
        email_subscriber_id:
          params.emailSubscriberId ?? existing.email_subscriber_id,
        total_revenue_pence: revenue,
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Contact update failed");
    return data as CrmContact;
  }

  const initialRevenue = params.revenueDeltaPence ?? 0;
  const stage =
    params.lifecycleStage ??
    (initialRevenue > 0 ? "customer" : "subscriber");

  const { data, error } = await supabase
    .from("crm_contacts")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      email,
      name: params.name ?? null,
      phone: params.phone ?? null,
      company: params.company ?? null,
      source: params.source ?? null,
      tags: params.tags ?? [],
      custom_fields: params.customFields ?? {},
      lifecycle_stage: stage,
      email_subscriber_id: params.emailSubscriberId ?? null,
      total_revenue_pence: initialRevenue,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Contact create failed");
  return data as CrmContact;
}

export async function syncSubscriberToContact(params: {
  organizationId: string;
  brandId: string;
  subscriberId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  source?: string | null;
  customFields?: Record<string, unknown>;
}) {
  const name = [params.firstName, params.lastName].filter(Boolean).join(" ") || null;
  const contact = await upsertCrmContact({
    organizationId: params.organizationId,
    brandId: params.brandId,
    email: params.email,
    name,
    source: params.source ?? "email_list",
    tags: ["email_subscriber"],
    customFields: params.customFields,
    lifecycleStage: "subscriber",
    emailSubscriberId: params.subscriberId,
  });
  await logCrmActivity({
    organizationId: params.organizationId,
    contactId: contact.id,
    type: "status_change",
    content: "Synced from email subscriber",
    meta: { subscriber_id: params.subscriberId },
  });

  try {
    const { emitAutomationEvent } = await import("@/lib/automations/runner");
    await emitAutomationEvent({
      organizationId: params.organizationId,
      brandId: params.brandId,
      event: "subscriber.created",
      data: {
        contact_id: contact.id,
        subscriber_id: params.subscriberId,
        email: params.email,
      },
    });
  } catch {
    // non-blocking
  }

  return contact;
}

export async function recordCrmOrder(params: {
  organizationId: string;
  brandId: string;
  email: string;
  name?: string | null;
  provider: "shopify" | "woocommerce" | "manual" | "form";
  externalId: string;
  orderTotalPence: number;
  currency?: string;
  orderedAt?: string;
  raw?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  const contact = await upsertCrmContact({
    organizationId: params.organizationId,
    brandId: params.brandId,
    email: params.email,
    name: params.name,
    source: params.provider,
    tags: [params.provider, "order"],
    revenueDeltaPence: 0, // apply after idempotent order insert
  });

  const { data: existingOrder } = await supabase
    .from("crm_orders")
    .select("id")
    .eq("brand_id", params.brandId)
    .eq("provider", params.provider)
    .eq("external_id", params.externalId)
    .maybeSingle();

  if (existingOrder) return { contact, created: false };

  await supabase.from("crm_orders").insert({
    organization_id: params.organizationId,
    brand_id: params.brandId,
    contact_id: contact.id,
    provider: params.provider,
    external_id: params.externalId,
    order_total_pence: params.orderTotalPence,
    currency: params.currency ?? "GBP",
    ordered_at: params.orderedAt ?? new Date().toISOString(),
    raw: params.raw ?? {},
  });

  await upsertCrmContact({
    organizationId: params.organizationId,
    brandId: params.brandId,
    email: params.email,
    revenueDeltaPence: params.orderTotalPence,
    source: params.provider,
  });

  await logCrmActivity({
    organizationId: params.organizationId,
    contactId: contact.id,
    type: "status_change",
    content: `Order ${params.externalId} via ${params.provider}: £${(params.orderTotalPence / 100).toFixed(2)}`,
    meta: { provider: params.provider, external_id: params.externalId },
  });

  return { contact, created: true };
}
