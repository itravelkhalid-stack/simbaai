import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { verifyMetaWebhookSignature } from "@/lib/social/meta-webhook";

export const runtime = "nodejs";

/**
 * Meta webhook verification (GET) + event ingest (POST).
 * Callback URL: {NEXT_PUBLIC_SITE_URL}/api/social/webhooks/meta
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;

  if (expected && token === expected && challenge != null) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    return NextResponse.json(
      { error: "Meta webhook not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (
    !verifyMetaWebhookSignature({
      rawBody,
      signatureHeader: signature,
      appSecret,
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const objectType =
    typeof payload.object === "string" ? payload.object : null;

  const supabase = createAdminClient();
  const { error } = await supabase.from("meta_webhook_events").insert({
    organization_id: null,
    object_type: objectType,
    payload,
  });

  if (error) {
    console.error("meta_webhook_events insert failed", error.message);
    return NextResponse.json({ error: "Persist failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
