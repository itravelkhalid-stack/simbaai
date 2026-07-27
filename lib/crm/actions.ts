"use server";

import { revalidatePath } from "next/cache";

import { getBrandContext } from "@/lib/brand/context";
import {
  draftFollowUpEmail,
  scoreLead,
} from "@/lib/agents/crm/generate";
import {
  ensureDefaultPipeline,
  logCrmActivity,
  upsertCrmContact,
  syncSubscriberToContact,
} from "@/lib/crm/contacts";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  LIFECYCLE_STAGES,
  type CrmLifecycleStage,
} from "@/lib/types/crm";

export type CrmActionResult = {
  error?: string;
  success?: string;
  draft?: { subject: string; body_markdown: string; rationale: string };
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify CRM");
  }
  return ctx;
}

export async function createContact(
  _prev: CrmActionResult,
  formData: FormData,
): Promise<CrmActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!brandId || !email) return { error: "Brand and email required" };

    await ensureDefaultPipeline(active.organization_id, brandId);
    const contact = await upsertCrmContact({
      organizationId: active.organization_id,
      brandId,
      email,
      name: String(formData.get("name") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      company: String(formData.get("company") ?? "").trim() || null,
      source: String(formData.get("source") ?? "manual").trim() || "manual",
      tags: String(formData.get("tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      lifecycleStage: (LIFECYCLE_STAGES as readonly string[]).includes(
        String(formData.get("lifecycleStage") ?? "lead"),
      )
        ? (String(formData.get("lifecycleStage")) as CrmLifecycleStage)
        : "lead",
    });

    await logCrmActivity({
      organizationId: active.organization_id,
      contactId: contact.id,
      type: "note",
      content: "Contact created",
      userId: user.id,
    });

    const { emitAutomationEvent } = await import("@/lib/automations/runner");
    for (const tag of contact.tags ?? []) {
      await emitAutomationEvent({
        organizationId: active.organization_id,
        brandId,
        event: "contact.tagged",
        data: { contact_id: contact.id, tag },
      });
    }

    revalidatePath("/crm");
    revalidatePath("/crm/contacts");
    return { success: "Contact saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function updateContactStage(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const contactId = String(formData.get("contactId") ?? "");
  const stage = String(formData.get("stage") ?? "") as CrmLifecycleStage;
  if (!contactId || !LIFECYCLE_STAGES.includes(stage)) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("crm_contacts")
    .select("lifecycle_stage")
    .eq("id", contactId)
    .eq("organization_id", active.organization_id)
    .single();

  await supabase
    .from("crm_contacts")
    .update({ lifecycle_stage: stage })
    .eq("id", contactId)
    .eq("organization_id", active.organization_id);

  await logCrmActivity({
    organizationId: active.organization_id,
    contactId,
    type: "status_change",
    content: `Lifecycle ${before?.lifecycle_stage ?? "?"} → ${stage}`,
    userId: user.id,
  });

  revalidatePath(`/crm/contacts/${contactId}`);
  revalidatePath("/crm");
}

export async function addContactNote(
  _prev: CrmActionResult,
  formData: FormData,
): Promise<CrmActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const contactId = String(formData.get("contactId") ?? "");
    const content = String(formData.get("content") ?? "").trim();
    const type = String(formData.get("type") ?? "note") as
      | "note"
      | "email"
      | "call"
      | "meeting"
      | "task";
    if (!contactId || !content) return { error: "Content required" };

    await logCrmActivity({
      organizationId: active.organization_id,
      contactId,
      type,
      content,
      userId: user.id,
    });
    revalidatePath(`/crm/contacts/${contactId}`);
    return { success: "Activity logged" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function createDeal(
  _prev: CrmActionResult,
  formData: FormData,
): Promise<CrmActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    const contactId = String(formData.get("contactId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const valuePounds = Number(formData.get("value") ?? 0);
    if (!brandId || !contactId || !name) {
      return { error: "Brand, contact, and name required" };
    }

    const pipeline = await ensureDefaultPipeline(
      active.organization_id,
      brandId,
    );
    const stage =
      String(formData.get("stage") ?? "") ||
      pipeline.stages[0]?.id ||
      "discovery";

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("crm_deals")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        contact_id: contactId,
        pipeline_id: pipeline.id,
        name,
        value_pence: Math.round(valuePounds * 100),
        stage,
        expected_close: String(formData.get("expectedClose") ?? "") || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };

    await logCrmActivity({
      organizationId: active.organization_id,
      contactId,
      dealId: data.id,
      type: "status_change",
      content: `Deal created: ${name}`,
      userId: user.id,
    });

    revalidatePath("/crm/deals");
    revalidatePath(`/crm/contacts/${contactId}`);
    return { success: "Deal created" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function moveDealStage(formData: FormData) {
  const { user, active } = await assertCanWrite();
  const dealId = String(formData.get("dealId") ?? "");
  const stage = String(formData.get("stage") ?? "");
  if (!dealId || !stage) return;

  const supabase = await createClient();
  const { data: deal } = await supabase
    .from("crm_deals")
    .select("*")
    .eq("id", dealId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!deal) return;

  const patch: {
    stage: string;
    stalled_since: string | null;
    won_at?: string | null;
    lost_at?: string | null;
    lost_reason?: string | null;
  } = {
    stage,
    stalled_since: null,
  };
  if (stage === "closed_won") {
    patch.won_at = new Date().toISOString();
    patch.lost_at = null;
  } else if (stage === "closed_lost") {
    patch.lost_at = new Date().toISOString();
    patch.won_at = null;
    patch.lost_reason = String(formData.get("lostReason") ?? "") || null;
  } else {
    patch.won_at = null;
    patch.lost_at = null;
  }

  await supabase.from("crm_deals").update(patch).eq("id", dealId);

  await logCrmActivity({
    organizationId: active.organization_id,
    contactId: deal.contact_id,
    dealId,
    type: "status_change",
    content: `Deal stage ${deal.stage} → ${stage}`,
    userId: user.id,
  });

  if (stage === "closed_won" && deal.value_pence > 0) {
    const admin = createAdminClient();
    const { data: contact } = await admin
      .from("crm_contacts")
      .select("email, total_revenue_pence, lifecycle_stage")
      .eq("id", deal.contact_id)
      .single();
    if (contact) {
      await admin
        .from("crm_contacts")
        .update({
          total_revenue_pence:
            (contact.total_revenue_pence ?? 0) + deal.value_pence,
          lifecycle_stage:
            contact.lifecycle_stage === "customer" ||
            contact.lifecycle_stage === "repeat"
              ? "repeat"
              : "customer",
        })
        .eq("id", deal.contact_id);
    }
  }

  if (stage === "closed_won") {
    const { emitAutomationEvent } = await import("@/lib/automations/runner");
    await emitAutomationEvent({
      organizationId: active.organization_id,
      brandId: deal.brand_id,
      event: "deal.won",
      data: {
        deal_id: dealId,
        contact_id: deal.contact_id,
        value_pence: deal.value_pence,
      },
    });
  }

  revalidatePath("/crm/deals");
  revalidatePath(`/crm/contacts/${deal.contact_id}`);
}

/** Client-friendly stage move used by drag-and-drop kanban */
export async function moveDealStageAction(
  dealId: string,
  stage: string,
): Promise<CrmActionResult> {
  try {
    const fd = new FormData();
    fd.set("dealId", dealId);
    fd.set("stage", stage);
    await moveDealStage(fd);
    return { success: "Stage updated" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function scoreContactNow(
  _prev: CrmActionResult,
  formData: FormData,
): Promise<CrmActionResult> {
  try {
    const { active } = await assertCanWrite();
    const contactId = String(formData.get("contactId") ?? "");
    if (!contactId) return { error: "Missing contact" };

    const supabase = await createClient();
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("id", contactId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!contact) return { error: "Not found" };

    const [{ data: activities }, { data: deals }] = await Promise.all([
      supabase
        .from("crm_activities")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("crm_deals").select("*").eq("contact_id", contactId),
    ]);

    const emailEngagement: Record<string, number> = {};
    if (contact.email) {
      const { data: events } = await supabase
        .from("email_events")
        .select("event_type")
        .eq("organization_id", active.organization_id)
        .eq("email", contact.email)
        .limit(200);
      for (const e of events ?? []) {
        emailEngagement[e.event_type] =
          (emailEngagement[e.event_type] ?? 0) + 1;
      }
    }

    const brandContext = await getBrandContext(
      active.organization_id,
      contact.brand_id,
    );
    const { withAgentRun } = await import("@/lib/agents/run-lifecycle");
    const { data: scoredData } = await withAgentRun({
      organizationId: active.organization_id,
      module: "crm",
      agentName: "crm_score_lead",
      input: { contactId },
      work: async () => {
        const scored = await scoreLead({
          brandContext,
          contact: contact as never,
          activities: (activities ?? []) as never,
          deals: (deals ?? []) as never,
          emailEngagement,
        });
        return {
          data: scored.data,
          model: scored.model,
          tokensIn: scored.tokensIn,
          tokensOut: scored.tokensOut,
          costPence: scored.costPence,
          output: { score: scored.data.score },
        };
      },
    });

    const patch: {
      lead_score: number;
      lead_score_reasoning: string;
      lead_scored_at: string;
      lifecycle_stage?: CrmLifecycleStage;
    } = {
      lead_score: scoredData.score,
      lead_score_reasoning: scoredData.reasoning,
      lead_scored_at: new Date().toISOString(),
    };
    if (scoredData.suggested_stage) {
      patch.lifecycle_stage = scoredData.suggested_stage;
    }

    await supabase.from("crm_contacts").update(patch).eq("id", contactId);

    await logCrmActivity({
      organizationId: active.organization_id,
      contactId,
      type: "note",
      content: `AI lead score: ${scoredData.score}/100 — ${scoredData.reasoning}`,
      meta: { score: scoredData.score },
    });

    revalidatePath(`/crm/contacts/${contactId}`);
    return { success: `Scored ${scoredData.score}/100` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function draftContactFollowUp(
  _prev: CrmActionResult,
  formData: FormData,
): Promise<CrmActionResult> {
  try {
    const { active } = await assertCanWrite();
    const contactId = String(formData.get("contactId") ?? "");
    if (!contactId) return { error: "Missing contact" };

    const supabase = await createClient();
    const { data: contact } = await supabase
      .from("crm_contacts")
      .select("*")
      .eq("id", contactId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!contact) return { error: "Not found" };

    const [{ data: activities }, { data: deals }] = await Promise.all([
      supabase
        .from("crm_activities")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("crm_deals").select("*").eq("contact_id", contactId),
    ]);

    const brandContext = await getBrandContext(
      active.organization_id,
      contact.brand_id,
    );
    const { withAgentRun } = await import("@/lib/agents/run-lifecycle");
    const { data: draft } = await withAgentRun({
      organizationId: active.organization_id,
      module: "crm",
      agentName: "crm_follow_up",
      input: { contactId },
      work: async () => {
        const drafted = await draftFollowUpEmail({
          brandContext,
          contact: contact as never,
          activities: (activities ?? []) as never,
          deals: (deals ?? []) as never,
        });
        return {
          data: drafted.data,
          model: drafted.model,
          tokensIn: drafted.tokensIn,
          tokensOut: drafted.tokensOut,
          costPence: drafted.costPence,
        };
      },
    });

    await logCrmActivity({
      organizationId: active.organization_id,
      contactId,
      type: "email",
      content: `AI draft — ${draft.subject}\n\n${draft.body_markdown}`,
      meta: { draft: true, rationale: draft.rationale },
    });

    revalidatePath(`/crm/contacts/${contactId}`);
    return {
      success: "Follow-up drafted",
      draft,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function syncEmailSubscribersToCrm(
  _prev: CrmActionResult,
  formData: FormData,
): Promise<CrmActionResult> {
  try {
    const { active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    if (!brandId) return { error: "Select a brand" };

    await ensureDefaultPipeline(active.organization_id, brandId);
    const supabase = createAdminClient();
    const { data: subs } = await supabase
      .from("email_subscribers")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .eq("status", "subscribed")
      .limit(500);

    let n = 0;
    for (const sub of subs ?? []) {
      await syncSubscriberToContact({
        organizationId: active.organization_id,
        brandId,
        subscriberId: sub.id,
        email: sub.email,
        firstName: sub.first_name,
        lastName: sub.last_name,
        source: sub.source ?? "email_list",
        customFields: (sub.custom_fields as Record<string, unknown>) ?? {},
      });
      n += 1;
    }

    revalidatePath("/crm/contacts");
    return { success: `Synced ${n} subscribers` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}
