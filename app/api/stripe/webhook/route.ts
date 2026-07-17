import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, planFromPriceId } from "@/lib/billing/stripe";
import type { OrgPlan } from "@/lib/types/database";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe webhook not configured" },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid signature" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("billing_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true, duplicate: true });

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created"
    ) {
      await syncSubscriptionFromEvent(event);
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const orgId =
        sub.metadata?.organization_id ||
        (await findOrgByCustomer(String(sub.customer)));
      if (orgId) {
        await supabase
          .from("organizations")
          .update({
            plan: "free" as OrgPlan,
            stripe_subscription_id: null,
            stripe_price_id: null,
            plan_period_start: null,
            plan_period_end: null,
          })
          .eq("id", orgId);
      }
    }

    const orgId =
      (event.data.object as { metadata?: { organization_id?: string } })
        .metadata?.organization_id ||
      (await findOrgFromEvent(event));

    if (orgId) {
      await supabase.from("billing_events").insert({
        organization_id: orgId,
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event.data.object as unknown as Record<string, unknown>,
      });
    }
  } catch (err) {
    console.error("Stripe webhook error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

async function findOrgByCustomer(customerId: string) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

async function findOrgFromEvent(event: Stripe.Event) {
  const obj = event.data.object as {
    customer?: string;
    metadata?: { organization_id?: string };
  };
  if (obj.metadata?.organization_id) return obj.metadata.organization_id;
  if (obj.customer) return findOrgByCustomer(String(obj.customer));
  return null;
}

async function syncSubscriptionFromEvent(event: Stripe.Event) {
  const stripe = getStripe();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orgId = session.metadata?.organization_id;
    if (!orgId || !session.subscription) return;

    const sub = await stripe.subscriptions.retrieve(
      String(session.subscription),
    );
    await applySubscription(orgId, sub);
    return;
  }

  const sub = event.data.object as Stripe.Subscription;
  const orgId =
    sub.metadata?.organization_id ||
    (await findOrgByCustomer(String(sub.customer)));
  if (!orgId) return;
  await applySubscription(orgId, sub);
}

async function applySubscription(orgId: string, sub: Stripe.Subscription) {
  const supabase = createAdminClient();
  const priceId = sub.items.data[0]?.price?.id ?? null;
  const plan =
    planFromPriceId(priceId) ||
    (sub.metadata?.plan as OrgPlan | undefined) ||
    "starter";

  const subAny = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStartSec =
    subAny.current_period_start ??
    (sub.items.data[0] as { current_period_start?: number } | undefined)
      ?.current_period_start;
  const periodEndSec =
    subAny.current_period_end ??
    (sub.items.data[0] as { current_period_end?: number } | undefined)
      ?.current_period_end;

  await supabase
    .from("organizations")
    .update({
      plan,
      stripe_customer_id: String(sub.customer),
      stripe_subscription_id: sub.id,
      stripe_price_id: priceId,
      plan_period_start: periodStartSec
        ? new Date(periodStartSec * 1000).toISOString()
        : null,
      plan_period_end: periodEndSec
        ? new Date(periodEndSec * 1000).toISOString()
        : null,
    })
    .eq("id", orgId);
}
