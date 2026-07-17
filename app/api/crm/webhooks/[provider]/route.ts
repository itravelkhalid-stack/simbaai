import { NextResponse } from "next/server";

import { ensureDefaultPipeline, recordCrmOrder } from "@/lib/crm/contacts";

function authOk(req: Request) {
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const header =
    req.headers.get("x-crm-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

function poundsToPence(amount: unknown) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  // Shopify often sends cents already as integer string; Woo may send major units
  return Math.round(n < 1000 && String(amount).includes(".") ? n * 100 : n);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  if (!authOk(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { provider } = await ctx.params;
  if (provider !== "shopify" && provider !== "woocommerce") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  try {
    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organization_id");
    const brandId = url.searchParams.get("brand_id");
    if (!organizationId || !brandId) {
      return NextResponse.json(
        { error: "organization_id and brand_id query params required" },
        { status: 400 },
      );
    }

    const payload = (await req.json()) as Record<string, unknown>;
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
      // Shopify total_price is major units as string
      totalPence = Math.round(Number(payload.total_price ?? 0) * 100);
      currency = String(payload.currency ?? "GBP");
      orderedAt = payload.created_at
        ? String(payload.created_at)
        : undefined;
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
