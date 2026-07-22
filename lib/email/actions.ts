"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getBrandContext } from "@/lib/brand/context";
import {
  generateCampaignEmail,
  proposeEmailFlow,
  writeFlowEmail,
} from "@/lib/agents/email/generate";
import {
  blocksToPlainText,
  renderEmailHtml,
} from "@/lib/email/blocks";
import {
  createOrgSendingDomain,
  refreshOrgSendingDomain,
} from "@/lib/email/domains";
import { buildComplianceFooter } from "@/lib/email/footer";
import { inngest } from "@/lib/inngest/client";
import { assertPlanAllows } from "@/lib/billing/plans";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailBlock, SegmentRuleGroup } from "@/lib/types/email";

export type EmailActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") throw new Error("Viewers cannot modify email");
  return ctx;
}

async function primaryBrandId(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_primary", true)
    .maybeSingle();
  if (data) return data.id;
  const { data: fallback } = await supabase
    .from("brands")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1)
    .maybeSingle();
  if (!fallback) throw new Error("No brand found");
  return fallback.id;
}

export async function createEmailList(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { active } = await assertCanWrite();
    const name = String(formData.get("name") ?? "").trim();
    if (name.length < 2) return { error: "Name is required" };
    const brandId = await primaryBrandId(active.organization_id);
    const supabase = await createClient();
    const { error } = await supabase.from("email_lists").insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      name,
      description: String(formData.get("description") ?? "") || null,
    });
    if (error) return { error: error.message };
    revalidatePath("/email/lists");
    return { success: "List created" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function createSegment(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { active } = await assertCanWrite();
    const name = String(formData.get("name") ?? "").trim();
    const rulesRaw = String(formData.get("rules") ?? "{}");
    const rules = JSON.parse(rulesRaw) as SegmentRuleGroup;
    const brandId = await primaryBrandId(active.organization_id);
    const supabase = await createClient();
    const { error } = await supabase.from("email_segments").insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      name,
      description: String(formData.get("description") ?? "") || null,
      rules,
    });
    if (error) return { error: error.message };
    revalidatePath("/email/segments");
    return { success: "Segment saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function saveCampaignDraft(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const supabase = await createClient();
    const brandId = await primaryBrandId(active.organization_id);
    const campaignId = String(formData.get("campaignId") ?? "") || undefined;
    const blocks = JSON.parse(String(formData.get("blocks") ?? "[]")) as EmailBlock[];
    const subjectVariants = String(formData.get("subjectVariants") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const listIds = String(formData.get("listIds") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const { data: domain } = await supabase
      .from("email_sending_domains")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("status", "verified")
      .limit(1)
      .maybeSingle();

    const address = domain?.physical_address || "Address not set — update Email settings";
    const footer = buildComplianceFooter({
      organizationId: active.organization_id,
      brandName: active.organization.name,
      physicalAddress: address,
      email: "preview@example.com",
      campaignId,
    });
    const html = renderEmailHtml({
      preheader: String(formData.get("preheader") ?? ""),
      blocks,
      footerHtml: footer.html,
      brandName: active.organization.name,
    });
    const plain = blocksToPlainText(blocks, footer.text);

    const payload = {
      organization_id: active.organization_id,
      brand_id: brandId,
      name: String(formData.get("name") ?? "Untitled campaign"),
      subject: String(formData.get("subject") ?? subjectVariants[0] ?? ""),
      subject_variants: subjectVariants,
      ab_test: formData.get("abTest") === "on",
      preheader: String(formData.get("preheader") ?? "") || null,
      blocks,
      html_content: html,
      plain_text: plain,
      list_ids: listIds,
      segment_id: String(formData.get("segmentId") ?? "") || null,
      sending_domain_id: String(formData.get("sendingDomainId") ?? "") || domain?.id || null,
      brief: String(formData.get("brief") ?? "") || null,
      created_by: user.id,
    };

    if (campaignId) {
      const { error } = await supabase
        .from("email_campaigns")
        .update(payload)
        .eq("id", campaignId)
        .eq("organization_id", active.organization_id);
      if (error) return { error: error.message };
      revalidatePath(`/email/campaigns/${campaignId}`);
      return { success: "Campaign saved" };
    }

    const { data, error } = await supabase
      .from("email_campaigns")
      .insert({ ...payload, status: "draft" })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Failed to create" };
    redirect(`/email/campaigns/${data.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function generateCampaignWithAi(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");
    const brief = String(formData.get("brief") ?? "").trim();
    if (brief.length < 10) return { error: "Brief is required" };
    const brandId = await primaryBrandId(active.organization_id);
    const brandContext = await getBrandContext(active.organization_id, brandId);
    const generated = await generateCampaignEmail({ brandContext, brief });

    const supabase = await createClient();
    const footer = buildComplianceFooter({
      organizationId: active.organization_id,
      brandName: active.organization.name,
      physicalAddress: "Address pending — set in Email settings",
      email: "preview@example.com",
    });
    const html = renderEmailHtml({
      preheader: generated.data.preheader,
      blocks: generated.data.blocks,
      footerHtml: footer.html,
      brandName: active.organization.name,
    });

    const { data, error } = await supabase
      .from("email_campaigns")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        name: brief.slice(0, 80),
        subject: generated.data.subject_variants[0] ?? "",
        subject_variants: generated.data.subject_variants,
        ab_test: true,
        preheader: generated.data.preheader,
        blocks: generated.data.blocks,
        html_content: html,
        plain_text: blocksToPlainText(generated.data.blocks, footer.text),
        status: "draft",
        brief,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (error || !data) return { error: error?.message ?? "Failed" };
    redirect(`/email/campaigns/${data.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "AI generation failed" };
  }
}

export async function scheduleCampaign(formData: FormData) {
  const campaignId = String(formData.get("campaignId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  const overrideReason = String(formData.get("overrideReason") ?? "").trim();
  if (!campaignId) throw new Error("Missing campaign");

  const { user, active } = await assertCanWrite();
  const supabase = await createClient();
  const when = scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString();

  const { data: campaign } = await supabase
    .from("email_campaigns")
    .select("id, brand_id, name, subject, html_content, plain_text, status")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  const { runEntityComplianceCheck } = await import("@/lib/compliance/check");
  const { assertComplianceAllowsApproval } = await import(
    "@/lib/compliance/gate"
  );
  const { writeAuditEvent } = await import("@/lib/compliance/audit");

  await runEntityComplianceCheck({
    organizationId: active.organization_id,
    brandId: campaign.brand_id,
    entityType: "email",
    entityId: campaignId,
    title: campaign.subject ?? campaign.name,
    body: campaign.plain_text || campaign.html_content || "",
  });

  await assertComplianceAllowsApproval({
    organizationId: active.organization_id,
    entityType: "email",
    entityId: campaignId,
    userId: user.id,
    role: active.role,
    overrideReason: overrideReason || null,
    actionLabel: "Schedule email campaign",
  });

  const { error } = await supabase
    .from("email_campaigns")
    .update({ status: "scheduled", scheduled_at: when })
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id);
  if (error) throw new Error(error.message);

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "publish",
    entityType: "email",
    entityId: campaignId,
    summary: "Email campaign scheduled",
    before: { status: campaign.status },
    after: { status: "scheduled", scheduled_at: when },
  });

  await inngest.send({
    name: "email/campaign.send",
    data: { campaignId },
  });

  revalidatePath(`/email/campaigns/${campaignId}`);
}

export async function proposeWelcomeFlow(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");
    const brief = String(formData.get("brief") ?? "").trim();
    if (brief.length < 10) return { error: "Brief is required" };
    const brandId = await primaryBrandId(active.organization_id);
    const brandContext = await getBrandContext(active.organization_id, brandId);
    const proposal = await proposeEmailFlow({
      brandContext,
      brief,
      emailCount: Number(formData.get("emailCount") ?? 5),
    });

    const supabase = await createClient();
    const { data: flow, error } = await supabase
      .from("email_flows")
      .insert({
        organization_id: active.organization_id,
        brand_id: brandId,
        name: proposal.data.name,
        trigger_type: "signup",
        status: "draft",
        strategy: proposal.data,
        list_id: String(formData.get("listId") ?? "") || null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error || !flow) return { error: error?.message ?? "Failed" };

    redirect(`/email/flows/${flow.id}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function writeApprovedFlowEmails(formData: FormData) {
  const flowId = String(formData.get("flowId") ?? "");
  if (!flowId) throw new Error("Missing flow");

  const { active } = await assertCanWrite();
  const supabase = await createClient();
  const { data: flow } = await supabase
    .from("email_flows")
    .select("*")
    .eq("id", flowId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!flow) throw new Error("Flow not found");

  const strategy = flow.strategy as {
    strategy_summary?: string;
    emails?: Array<{
      position: number;
      delay_hours: number;
      goal: string;
      subject: string;
      preheader: string;
      angle: string;
    }>;
  };

  const brandContext = await getBrandContext(active.organization_id, flow.brand_id);
  await supabase.from("email_flow_steps").delete().eq("flow_id", flowId);

  for (const email of strategy.emails ?? []) {
    const written = await writeFlowEmail({
      brandContext,
      strategySummary: strategy.strategy_summary ?? "",
      email,
    });
    const footer = buildComplianceFooter({
      organizationId: active.organization_id,
      brandName: active.organization.name,
      physicalAddress: "Address pending — set in Email settings",
      email: "preview@example.com",
    });
    await supabase.from("email_flow_steps").insert({
      organization_id: active.organization_id,
      flow_id: flowId,
      position: email.position,
      delay_hours: email.delay_hours,
      subject: written.data.subject || email.subject,
      preheader: written.data.preheader || email.preheader,
      blocks: written.data.blocks,
      html_content: renderEmailHtml({
        preheader: written.data.preheader,
        blocks: written.data.blocks,
        footerHtml: footer.html,
        brandName: active.organization.name,
      }),
      goal: email.goal,
      condition: {},
    });
  }

  revalidatePath(`/email/flows/${flowId}`);
}

export async function addSendingDomain(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { active } = await assertCanWrite();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners/admins can manage domains" };
    }
    const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
    if (!domain.includes(".")) return { error: "Enter a valid domain" };
    const brandId = await primaryBrandId(active.organization_id);
    await createOrgSendingDomain({
      organizationId: active.organization_id,
      brandId,
      domain,
      fromName: String(formData.get("fromName") ?? "") || undefined,
      physicalAddress: String(formData.get("physicalAddress") ?? "") || undefined,
    });
    revalidatePath("/email/settings");
    return { success: "Domain created — add the DNS records below" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function refreshSendingDomain(formData: FormData) {
  const domainId = String(formData.get("domainId") ?? "");
  const { active } = await assertCanWrite();
  const supabase = await createClient();
  const { data } = await supabase
    .from("email_sending_domains")
    .select("*")
    .eq("id", domainId)
    .eq("organization_id", active.organization_id)
    .single();
  if (!data) throw new Error("Domain not found");
  await refreshOrgSendingDomain(data);
  revalidatePath("/email/settings");
}

export async function updateSendingDomainDetails(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { active } = await assertCanWrite();
    const domainId = String(formData.get("domainId") ?? "");
    const supabase = await createClient();
    const { error } = await supabase
      .from("email_sending_domains")
      .update({
        from_name: String(formData.get("fromName") ?? "") || null,
        from_email: String(formData.get("fromEmail") ?? "") || null,
        physical_address: String(formData.get("physicalAddress") ?? "") || null,
      })
      .eq("id", domainId)
      .eq("organization_id", active.organization_id);
    if (error) return { error: error.message };
    revalidatePath("/email/settings");
    return { success: "Domain details saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function importSubscribersAction(
  _prev: EmailActionResult,
  formData: FormData,
): Promise<EmailActionResult> {
  try {
    const { active } = await assertCanWrite();
    const listId = String(formData.get("listId") ?? "");
    const mapping = JSON.parse(String(formData.get("mapping") ?? "{}")) as Record<
      string,
      string
    >;
    const rows = JSON.parse(String(formData.get("rows") ?? "[]")) as Array<
      Record<string, string>
    >;
    if (!listId) return { error: "List is required" };
    if (!rows.length) return { error: "No rows to import" };

    const brandId = await primaryBrandId(active.organization_id);
    const supabase = await createClient();
    const { data: suppressed } = await supabase
      .from("email_suppression_list")
      .select("email")
      .eq("organization_id", active.organization_id);
    const suppressedSet = new Set((suppressed ?? []).map((s) => s.email));

    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const email = String(row[mapping.email] ?? "").trim().toLowerCase();
      if (!email || !email.includes("@") || suppressedSet.has(email)) {
        skipped += 1;
        continue;
      }
      const payload = {
        organization_id: active.organization_id,
        brand_id: brandId,
        list_id: listId,
        email,
        first_name: mapping.first_name ? String(row[mapping.first_name] ?? "") || null : null,
        last_name: mapping.last_name ? String(row[mapping.last_name] ?? "") || null : null,
        custom_fields: {} as Record<string, unknown>,
        status: "subscribed" as const,
        source: "csv_import",
        consent_timestamp: new Date().toISOString(),
        consent_source: "csv_import",
      };
      for (const [field, column] of Object.entries(mapping)) {
        if (["email", "first_name", "last_name"].includes(field)) continue;
        if (column && row[column] != null) payload.custom_fields[field] = row[column];
      }

      const { error } = await supabase.from("email_subscribers").upsert(payload, {
        onConflict: "list_id,email",
        ignoreDuplicates: false,
      });
      if (error) skipped += 1;
      else {
        imported += 1;
        try {
          const { data: sub } = await supabase
            .from("email_subscribers")
            .select("id")
            .eq("list_id", listId)
            .eq("email", email)
            .maybeSingle();
          const { syncSubscriberToContact } = await import("@/lib/crm/contacts");
          if (sub?.id) {
            await syncSubscriberToContact({
              organizationId: active.organization_id,
              brandId,
              subscriberId: sub.id,
              email,
              firstName: payload.first_name,
              lastName: payload.last_name,
              source: "csv_import",
              customFields: payload.custom_fields,
            });
          }
        } catch {
          // CRM sync is best-effort
        }
      }
    }

    revalidatePath(`/email/lists/${listId}`);
    revalidatePath("/email/subscribers");
    return { success: `Imported ${imported}, skipped ${skipped}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Import failed" };
  }
}

export async function addTagToSubscriber(formData: FormData) {
  const { active } = await assertCanWrite();
  const subscriberId = String(formData.get("subscriberId") ?? "");
  const tagName = String(formData.get("tag") ?? "").trim().toLowerCase();
  if (!subscriberId || !tagName) throw new Error("Missing tag");

  const brandId = await primaryBrandId(active.organization_id);
  const supabase = await createClient();
  const { data: tag } = await supabase
    .from("email_tags")
    .upsert(
      {
        organization_id: active.organization_id,
        brand_id: brandId,
        name: tagName,
      },
      { onConflict: "organization_id,name" },
    )
    .select("id")
    .single();
  if (!tag) throw new Error("Failed to create tag");

  await supabase.from("email_subscriber_tags").upsert({
    subscriber_id: subscriberId,
    tag_id: tag.id,
    organization_id: active.organization_id,
  });
  revalidatePath("/email/subscribers");
}
