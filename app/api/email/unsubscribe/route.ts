import { NextResponse } from "next/server";

import { verifyUnsubscribeToken } from "@/lib/email/footer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return new NextResponse("Missing token", { status: 400 });
  }

  try {
    const payload = verifyUnsubscribeToken(token);
    const email = payload.email.toLowerCase();
    const supabase = createAdminClient();

    await supabase.from("email_suppression_list").upsert(
      {
        organization_id: payload.orgId,
        email,
        reason: "unsubscribe",
        source: "one_click_link",
      },
      { onConflict: "organization_id,email" },
    );

    await supabase
      .from("email_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("organization_id", payload.orgId)
      .eq("email", email);

    if (payload.campaignId) {
      await supabase.from("email_events").insert({
        organization_id: payload.orgId,
        campaign_id: payload.campaignId,
        email,
        event_type: "unsubscribed",
        meta: { via: "link" },
      });

      const { data: campaign } = await supabase
        .from("email_campaigns")
        .select("stats")
        .eq("id", payload.campaignId)
        .maybeSingle();
      if (campaign) {
        const stats = {
          ...(campaign.stats as Record<string, number>),
          unsubscribes:
            Number((campaign.stats as Record<string, number>)?.unsubscribes ?? 0) + 1,
        };
        await supabase
          .from("email_campaigns")
          .update({ stats })
          .eq("id", payload.campaignId);
      }
    }

    return new NextResponse(
      `<!doctype html><html><body style="font-family:sans-serif;padding:40px;">
        <h1>You have been unsubscribed</h1>
        <p>${email} will no longer receive marketing emails from this brand.</p>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Unsubscribe failed",
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  // One-click List-Unsubscribe=One-Click
  return GET(request);
}
