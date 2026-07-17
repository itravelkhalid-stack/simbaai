"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { checkPlanLimit } from "@/lib/billing/plans";
import {
  BILLABLE_PLANS,
  getStripe,
  planFromPriceId,
  priceIdForPlan,
  stripeConfigured,
} from "@/lib/billing/stripe";
import { runDailyFinanceIngestion } from "@/lib/finance/ingest";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FINANCE_CHANNELS,
  type FinanceChannel,
} from "@/lib/types/finance";
import type { OrgPlan } from "@/lib/types/database";

export type FinanceActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify finance");
  }
  return ctx;
}

export async function upsertBudget(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  try {
    const { user, active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    const channel = String(formData.get("channel") ?? "") as FinanceChannel;
    const periodStart = String(formData.get("periodStart") ?? "");
    const periodEnd = String(formData.get("periodEnd") ?? "");
    const planned = Math.round(Number(formData.get("planned") ?? 0) * 100);
    if (!brandId || !periodStart || !periodEnd) {
      return { error: "Brand and period required" };
    }
    if (!FINANCE_CHANNELS.includes(channel)) return { error: "Invalid channel" };

    const supabase = await createClient();
    const { data: before } = await supabase
      .from("budgets")
      .select("planned_pence, currency")
      .eq("organization_id", active.organization_id)
      .eq("brand_id", brandId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .eq("channel", channel)
      .maybeSingle();

    const plannedPence = Math.max(0, planned);
    const currency = String(formData.get("currency") ?? "GBP");
    const { error } = await supabase.from("budgets").upsert(
      {
        organization_id: active.organization_id,
        brand_id: brandId,
        period_start: periodStart,
        period_end: periodEnd,
        channel,
        planned_pence: plannedPence,
        currency,
      },
      { onConflict: "brand_id,period_start,period_end,channel" },
    );
    if (error) return { error: error.message };

    const { writeAuditEvent } = await import("@/lib/compliance/audit");
    await writeAuditEvent({
      organizationId: active.organization_id,
      actorUserId: user.id,
      action: "budget_change",
      entityType: "budget",
      entityId: `${brandId}:${channel}:${periodStart}`,
      summary: `Budget ${channel} set to £${(plannedPence / 100).toFixed(0)}`,
      before: before
        ? { planned_pence: before.planned_pence, currency: before.currency }
        : null,
      after: { planned_pence: plannedPence, currency, channel },
    });

    revalidatePath("/finance");
    return { success: "Budget saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function addManualExpense(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  try {
    const { active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    const channel = String(formData.get("channel") ?? "") as FinanceChannel;
    const expenseDate = String(formData.get("expenseDate") ?? "");
    const description = String(formData.get("description") ?? "").trim();
    const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
    if (!brandId || !expenseDate || !description) {
      return { error: "Required fields missing" };
    }
    if (!FINANCE_CHANNELS.includes(channel)) return { error: "Invalid channel" };

    const supabase = await createClient();
    const reference = `manual:${crypto.randomUUID()}`;
    const { error } = await supabase.from("expenses").insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      expense_date: expenseDate,
      channel,
      description,
      amount_pence: Math.max(0, amount),
      source: "manual",
      reference,
    });
    if (error) return { error: error.message };
    revalidatePath("/finance");
    return { success: "Expense added" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function addManualRevenue(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  try {
    const { active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    const revenueDate = String(formData.get("revenueDate") ?? "");
    const amount = Math.round(Number(formData.get("amount") ?? 0) * 100);
    const orders = Math.max(0, Math.round(Number(formData.get("orders") ?? 0)));
    if (!brandId || !revenueDate) return { error: "Brand and date required" };

    const supabase = await createClient();
    const reference = `manual:${crypto.randomUUID()}`;
    const { error } = await supabase.from("revenue_records").insert({
      organization_id: active.organization_id,
      brand_id: brandId,
      revenue_date: revenueDate,
      source: "manual",
      amount_pence: Math.max(0, amount),
      orders_count: orders,
      reference,
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
    if (error) return { error: error.message };
    revalidatePath("/finance");
    return { success: "Revenue recorded" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function saveFinanceSettings(
  _prev: FinanceActionResult,
  formData: FormData,
): Promise<FinanceActionResult> {
  try {
    const { active } = await assertCanWrite();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Owners/admins only" };
    }
    const brandId = String(formData.get("brandId") ?? "");
    const cogs = Number(formData.get("cogsPct") ?? 0);
    if (!brandId) return { error: "Brand required" };

    const supabase = await createClient();
    const { error } = await supabase.from("brand_finance_settings").upsert(
      {
        organization_id: active.organization_id,
        brand_id: brandId,
        cogs_pct: Math.min(100, Math.max(0, cogs)),
        currency: String(formData.get("currency") ?? "GBP"),
      },
      { onConflict: "brand_id" },
    );
    if (error) return { error: error.message };
    revalidatePath("/finance");
    revalidatePath("/finance/settings");
    return { success: "Settings saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function runFinanceIngestionNow(
  _prev: FinanceActionResult,
  _formData?: FormData,
): Promise<FinanceActionResult> {
  void _prev;
  void _formData;
  try {
    await assertCanWrite();
    const result = await runDailyFinanceIngestion();
    revalidatePath("/finance");
    return {
      success: `Ingested ads ${result.ads.inserted}, platform ${result.platform.inserted}, revenue ${result.revenue.inserted}`,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function createCheckoutSession(formData: FormData) {
  const { user, active } = await assertCanWrite();
  if (active.role !== "org_owner" && active.role !== "org_admin") {
    throw new Error("Only owners/admins can change billing");
  }
  if (!stripeConfigured()) {
    throw new Error("Stripe is not configured");
  }

  const plan = String(formData.get("plan") ?? "") as OrgPlan;
  if (!BILLABLE_PLANS.includes(plan)) throw new Error("Invalid plan");
  const priceId = priceIdForPlan(plan);
  if (!priceId) throw new Error(`Missing STRIPE_PRICE_${plan.toUpperCase()}`);

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", active.organization_id)
    .single();
  if (!org) throw new Error("Org not found");

  const stripe = getStripe();
  let customerId = org.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: org.name,
      metadata: { organization_id: org.id },
    });
    customerId = customer.id;
    await supabase
      .from("organizations")
      .update({
        stripe_customer_id: customerId,
        billing_email: user.email ?? null,
      })
      .eq("id", org.id);
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/finance/billing?success=1`,
    cancel_url: `${siteUrl}/finance/billing?cancelled=1`,
    metadata: { organization_id: org.id, plan },
    subscription_data: {
      metadata: { organization_id: org.id, plan },
    },
  });

  if (!session.url) throw new Error("No checkout URL");
  redirect(session.url);
}

export async function createBillingPortalSession() {
  const { active } = await assertCanWrite();
  if (active.role !== "org_owner" && active.role !== "org_admin") {
    throw new Error("Only owners/admins can manage billing");
  }
  if (!stripeConfigured()) throw new Error("Stripe is not configured");

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", active.organization_id)
    .single();
  if (!org?.stripe_customer_id) {
    throw new Error("No Stripe customer yet — pick a plan first");
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${siteUrl}/finance/billing`,
  });
  redirect(session.url);
}

/** Soft gate helper usable from other modules' server actions */
export async function assertPlanAllows(
  organizationId: string,
  key: Parameters<typeof checkPlanLimit>[1],
) {
  const result = await checkPlanLimit(organizationId, key, { increment: 1 });
  if (!result.ok) throw new Error(result.message);
  return result;
}

export { planFromPriceId };
