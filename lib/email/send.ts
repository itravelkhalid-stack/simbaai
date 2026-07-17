import { Resend } from "resend";

import {
  blocksToPlainText,
  renderEmailHtml,
} from "@/lib/email/blocks";
import { buildComplianceFooter } from "@/lib/email/footer";
import { subscriberMatchesSegment } from "@/lib/email/segments";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  EmailBlock,
  EmailCampaign,
  EmailSendingDomain,
  EmailSubscriber,
  SegmentRuleGroup,
} from "@/lib/types/email";

const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  return new Resend(key);
}

async function loadRecipients(campaign: EmailCampaign) {
  const supabase = createAdminClient();
  let query = supabase
    .from("email_subscribers")
    .select("*")
    .eq("organization_id", campaign.organization_id)
    .eq("status", "subscribed");

  if (campaign.list_ids?.length) {
    query = query.in("list_id", campaign.list_ids);
  }

  const { data: subscribers, error } = await query;
  if (error) throw new Error(error.message);

  const { data: suppressed } = await supabase
    .from("email_suppression_list")
    .select("email")
    .eq("organization_id", campaign.organization_id);

  const suppressedSet = new Set((suppressed ?? []).map((row) => row.email));

  let segmentRules: SegmentRuleGroup | null = null;
  if (campaign.segment_id) {
    const { data: segment } = await supabase
      .from("email_segments")
      .select("rules")
      .eq("id", campaign.segment_id)
      .maybeSingle();
    segmentRules = (segment?.rules as SegmentRuleGroup) ?? null;
  }

  const withTags: Array<EmailSubscriber & { tags: string[] }> = [];
  const ids = ((subscribers ?? []) as EmailSubscriber[]).map((s) => s.id);
  const tagMap = new Map<string, string[]>();
  if (ids.length) {
    const { data: tagRows } = await supabase
      .from("email_subscriber_tags")
      .select("subscriber_id, tag_id")
      .in("subscriber_id", ids);
    const tagIds = Array.from(
      new Set((tagRows ?? []).map((row) => row.tag_id).filter(Boolean)),
    );
    const { data: tags } = tagIds.length
      ? await supabase.from("email_tags").select("id, name").in("id", tagIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const nameById = new Map((tags ?? []).map((t) => [t.id, t.name]));
    for (const row of tagRows ?? []) {
      const list = tagMap.get(row.subscriber_id) ?? [];
      const name = nameById.get(row.tag_id);
      if (name) list.push(name);
      tagMap.set(row.subscriber_id, list);
    }
  }

  for (const sub of (subscribers ?? []) as EmailSubscriber[]) {
    if (suppressedSet.has(sub.email)) continue;
    const enriched = { ...sub, tags: tagMap.get(sub.id) ?? [] };
    if (segmentRules && !subscriberMatchesSegment(enriched, segmentRules)) {
      continue;
    }
    withTags.push(enriched);
  }

  // Dedupe by email across lists
  const byEmail = new Map<string, EmailSubscriber & { tags: string[] }>();
  for (const sub of withTags) {
    if (!byEmail.has(sub.email)) byEmail.set(sub.email, sub);
  }
  return Array.from(byEmail.values());
}

export async function sendCampaign(campaignId: string) {
  const supabase = createAdminClient();
  const { data: campaign, error } = await supabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (error || !campaign) throw new Error(error?.message ?? "Campaign not found");

  const typed = campaign as EmailCampaign;
  if (!["scheduled", "draft", "sending"].includes(typed.status)) {
    return { skipped: true as const, reason: `status=${typed.status}` };
  }

  const { data: domain } = typed.sending_domain_id
    ? await supabase
        .from("email_sending_domains")
        .select("*")
        .eq("id", typed.sending_domain_id)
        .maybeSingle()
    : { data: null };

  const sendingDomain = domain as EmailSendingDomain | null;
  if (!sendingDomain || sendingDomain.status !== "verified") {
    throw new Error("Campaign requires a verified sending domain");
  }
  if (!sendingDomain.physical_address?.trim()) {
    throw new Error("Physical address is required for compliance footer");
  }
  if (!sendingDomain.from_email) {
    throw new Error("From email is missing on the sending domain");
  }

  const { data: brand } = await supabase
    .from("brands")
    .select("name")
    .eq("id", typed.brand_id)
    .single();

  await supabase
    .from("email_campaigns")
    .update({ status: "sending" })
    .eq("id", campaignId);

  const recipients = await loadRecipients(typed);
  const resend = getResend();
  let sent = 0;

  const subjectPool =
    typed.ab_test && typed.subject_variants?.length
      ? typed.subject_variants
      : [typed.subject];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (subscriber, index) => {
        const subject =
          subjectPool[(i + index) % subjectPool.length] || typed.subject;
        const footer = buildComplianceFooter({
          organizationId: typed.organization_id,
          brandName: brand?.name ?? "Brand",
          physicalAddress: sendingDomain.physical_address!,
          email: subscriber.email,
          campaignId: typed.id,
        });

        const html = renderEmailHtml({
          preheader: typed.preheader,
          blocks: (typed.blocks ?? []) as EmailBlock[],
          footerHtml: footer.html,
          brandName: brand?.name ?? "Brand",
        });
        const text = blocksToPlainText(
          (typed.blocks ?? []) as EmailBlock[],
          footer.text,
        );

        const from = `${sendingDomain.from_name || brand?.name || "GrowthOS"} <${sendingDomain.from_email}>`;
        const { data, error: sendError } = await resend.emails.send({
          from,
          to: subscriber.email,
          subject,
          html,
          text,
          headers: {
            "List-Unsubscribe": `<${footer.unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          tags: [
            { name: "campaign_id", value: typed.id },
            { name: "organization_id", value: typed.organization_id },
          ],
        });

        if (sendError) {
          await supabase.from("email_events").insert({
            organization_id: typed.organization_id,
            campaign_id: typed.id,
            subscriber_id: subscriber.id,
            email: subscriber.email,
            event_type: "bounced",
            meta: { error: sendError.message },
          });
          return;
        }

        sent += 1;
        await supabase.from("email_events").insert({
          organization_id: typed.organization_id,
          campaign_id: typed.id,
          subscriber_id: subscriber.id,
          email: subscriber.email,
          event_type: "sent",
          provider_message_id: data?.id ?? null,
          meta: { subject },
        });
      }),
    );

    if (i + BATCH_SIZE < recipients.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  const stats = {
    ...(typed.stats ?? {}),
    sent,
  };

  await supabase
    .from("email_campaigns")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      stats,
      html_content: renderEmailHtml({
        preheader: typed.preheader,
        blocks: (typed.blocks ?? []) as EmailBlock[],
        footerHtml: buildComplianceFooter({
          organizationId: typed.organization_id,
          brandName: brand?.name ?? "Brand",
          physicalAddress: sendingDomain.physical_address,
          email: "preview@example.com",
          campaignId: typed.id,
        }).html,
        brandName: brand?.name ?? "Brand",
      }),
    })
    .eq("id", campaignId);

  return { ok: true as const, sent, recipients: recipients.length };
}
