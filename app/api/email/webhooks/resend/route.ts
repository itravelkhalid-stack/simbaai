import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailEventType } from "@/lib/types/email";

type ResendWebhook = {
  type?: string;
  data?: {
    email_id?: string;
    to?: string[] | string;
    bounce?: { message?: string };
    click?: { link?: string };
  };
};

function mapEvent(type?: string): EmailEventType | null {
  switch (type) {
    case "email.sent":
      return "sent";
    case "email.delivered":
      return "delivered";
    case "email.opened":
      return "opened";
    case "email.clicked":
      return "clicked";
    case "email.bounced":
      return "bounced";
    case "email.complained":
      return "complained";
    default:
      return null;
  }
}

function bumpStat(
  stats: Record<string, number>,
  key: string,
): Record<string, number> {
  return { ...stats, [key]: Number(stats[key] ?? 0) + 1 };
}

export async function POST(request: Request) {
  const payload = (await request.json()) as ResendWebhook;
  const eventType = mapEvent(payload.type);
  if (!eventType) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const supabase = createAdminClient();
  const messageId = payload.data?.email_id ?? null;
  const emailRaw = payload.data?.to;
  const email = Array.isArray(emailRaw)
    ? emailRaw[0]?.toLowerCase()
    : String(emailRaw ?? "").toLowerCase();

  let organizationId: string | null = null;
  let campaignId: string | null = null;
  let subscriberId: string | null = null;

  if (messageId) {
    const { data: prior } = await supabase
      .from("email_events")
      .select("organization_id, campaign_id, subscriber_id, email")
      .eq("provider_message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (prior) {
      organizationId = prior.organization_id;
      campaignId = prior.campaign_id;
      subscriberId = prior.subscriber_id;
    }
  }

  if (!organizationId && email) {
    const { data: sub } = await supabase
      .from("email_subscribers")
      .select("id, organization_id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (sub) {
      organizationId = sub.organization_id;
      subscriberId = sub.id;
    }
  }

  if (!organizationId) {
    return NextResponse.json({ ok: true, unmatched: true });
  }

  await supabase.from("email_events").insert({
    organization_id: organizationId,
    campaign_id: campaignId,
    subscriber_id: subscriberId,
    email: email || "unknown",
    event_type: eventType,
    provider_message_id: messageId,
    meta: payload.data ?? {},
  });

  if (eventType === "bounced" || eventType === "complained") {
    if (email) {
      await supabase.from("email_suppression_list").upsert(
        {
          organization_id: organizationId,
          email,
          reason: eventType,
          source: "resend_webhook",
        },
        { onConflict: "organization_id,email" },
      );
      await supabase
        .from("email_subscribers")
        .update({
          status: eventType === "complained" ? "complained" : "bounced",
        })
        .eq("organization_id", organizationId)
        .eq("email", email);
    }
  }

  if (campaignId) {
    const { data: campaign } = await supabase
      .from("email_campaigns")
      .select("stats")
      .eq("id", campaignId)
      .maybeSingle();
    if (campaign) {
      const stats = { ...(campaign.stats as Record<string, number>) };
      const key =
        eventType === "delivered"
          ? "delivered"
          : eventType === "opened"
            ? "opens"
            : eventType === "clicked"
              ? "clicks"
              : eventType === "bounced"
                ? "bounces"
                : eventType === "complained"
                  ? "complaints"
                  : eventType === "unsubscribed"
                    ? "unsubscribes"
                    : null;
      if (key) {
        await supabase
          .from("email_campaigns")
          .update({ stats: bumpStat(stats, key) })
          .eq("id", campaignId);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
