import { NextResponse } from "next/server";

import { ensureDefaultPipeline, recordCrmOrder } from "@/lib/crm/contacts";
import { verifyCrmWebhook } from "@/lib/crm/webhook-auth";

function poundsToPence(amount: unknown) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n < 1000 && String(amount).includes(".") ? n * 100 : n);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  if (provider !== "shopify" && provider !== "woocommerce") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const url = new URL(req.url);
  const organizationId = url.searchParams.get("organization_id");
  const brandId = url.searchParams.get("brand_id");
  if (!organizationId || !brandId) {
    return NextResponse.json(
      { error: "organization_id and brand_id query params required" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  const auth = await verifyCrmWebhook({
    req,
    provider,
    organizationId,
    rawBody,
  });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  try {
    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    await ensureDefaultPipeline(organizationId, brandId);

    let email = "";
    let name: string | null = null;
    let externalId = "";
    let totalPence = 0;
    let currency = "GBP";
    let orderedAt: string | undefined;

    if (provider === "shopify") {
      const customer = (payload.customer ?? {}) as Record<string, unknown>;
      email = String(customer.email ?? payload.email ?? "").toLowerCase();
      name =
        [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
        String(payload.name ?? "") ||
        null;
      externalId = String(payload.id ?? payload.order_number ?? "");
      totalPence = Math.round(Number(payload.total_price ?? 0) * 100);
      currency = String(payload.currency ?? "GBP");
      orderedAt = payload.created_at ? String(payload.created_at) : undefined;
    } else {
      const billing = (payload.billing ?? {}) as Record<string, unknown>;
      email = String(
        payload.billing_email ?? billing.email ?? payload.email ?? "",
      ).toLowerCase();
      name =
        [billing.first_name, billing.last_name].filter(Boolean).join(" ") ||
        null;
      externalId = String(payload.id ?? payload.number ?? "");
      totalPence = poundsToPence(payload.total ?? payload.total_price ?? 0);
      currency = String(payload.currency ?? "GBP");
      orderedAt = payload.date_created
        ? String(payload.date_created)
        : undefined;
    }

    if (!email || !externalId) {
      return NextResponse.json(
        { error: "email and order id required" },
        { status: 400 },
      );
    }

    const result = await recordCrmOrder({
      organizationId,
      brandId,
      email,
      name,
      provider,
      externalId,
      orderTotalPence: totalPence,
      currency,
      orderedAt,
      raw: payload,
    });

    return NextResponse.json({
      ok: true,
      contact_id: result.contact.id,
      created: result.created,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
