import Stripe from "stripe";

import type { OrgPlan } from "@/lib/types/database";

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Map env price IDs → plans */
export function planFromPriceId(priceId: string | null | undefined): OrgPlan | null {
  if (!priceId) return null;
  const map: Record<string, OrgPlan> = {};
  if (process.env.STRIPE_PRICE_STARTER) map[process.env.STRIPE_PRICE_STARTER] = "starter";
  if (process.env.STRIPE_PRICE_GROWTH) map[process.env.STRIPE_PRICE_GROWTH] = "growth";
  if (process.env.STRIPE_PRICE_AGENCY) map[process.env.STRIPE_PRICE_AGENCY] = "agency";
  return map[priceId] ?? null;
}

export function priceIdForPlan(plan: OrgPlan): string | null {
  if (plan === "starter") return process.env.STRIPE_PRICE_STARTER ?? null;
  if (plan === "growth") return process.env.STRIPE_PRICE_GROWTH ?? null;
  if (plan === "agency") return process.env.STRIPE_PRICE_AGENCY ?? null;
  return null;
}

export const BILLABLE_PLANS: OrgPlan[] = ["starter", "growth", "agency"];
