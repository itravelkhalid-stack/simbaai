import {
  createBillingPortalSession,
  createCheckoutSession,
} from "@/lib/finance/actions";
import { FinanceNav } from "@/components/finance/finance-nav";
import { getUsageSnapshot, formatPlanLimit } from "@/lib/billing/plans";
import { stripeConfigured, BILLABLE_PLANS } from "@/lib/billing/stripe";
import { PLAN_LIMITS } from "@/lib/types/finance";
import { requireActiveOrg } from "@/lib/org/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/billing/stripe";
import { Button } from "@/components/ui/button";
import type { OrgPlan } from "@/lib/types/database";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
  const { active } = await requireActiveOrg();
  const params = await searchParams;
  const usage = await getUsageSnapshot(active.organization_id);
  const configured = stripeConfigured();

  const supabase = createAdminClient();
  const { data: org } = await supabase
    .from("organizations")
    .select(
      "plan, stripe_customer_id, stripe_subscription_id, plan_period_end, billing_email",
    )
    .eq("id", active.organization_id)
    .single();

  let invoices: Array<{
    id: string;
    number: string | null;
    status: string | null;
    amount_due: number;
    currency: string;
    hosted_invoice_url: string | null;
    created: number;
  }> = [];

  if (configured && org?.stripe_customer_id) {
    try {
      const stripe = getStripe();
      const list = await stripe.invoices.list({
        customer: org.stripe_customer_id,
        limit: 12,
      });
      invoices = list.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status ?? null,
        amount_due: inv.amount_due,
        currency: inv.currency,
        hosted_invoice_url: inv.hosted_invoice_url ?? null,
        created: inv.created,
      }));
    } catch {
      invoices = [];
    }
  }

  const canManage =
    active.role === "org_owner" || active.role === "org_admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Platform billing
        </h1>
        <p className="mt-2 text-muted-foreground">
          Simba AI plan, usage against limits, and Stripe invoices.
        </p>
      </div>
      <FinanceNav current="/finance/billing" />

      {params.success ? (
        <p className="rounded-xl border border-emerald-500/30 p-3 text-sm">
          Checkout completed — plan updates when Stripe confirms the subscription.
        </p>
      ) : null}
      {params.cancelled ? (
        <p className="rounded-xl border p-3 text-sm text-muted-foreground">
          Checkout cancelled.
        </p>
      ) : null}

      <section className="rounded-xl border p-4">
        <p className="text-sm font-medium">
          Current plan: {PLAN_LIMITS[usage.plan].label}
          {usage.plan === "internal" ? " (platform)" : ""}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {usage.plan === "internal"
            ? "Internal plan — unlimited quotas, not billed via Stripe."
            : org?.plan_period_end
              ? `Period ends ${new Date(org.plan_period_end).toLocaleDateString()}`
              : "No active paid subscription period"}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              "brands",
              "ai_runs_month",
              "connected_channels",
              "team_members",
            ] as const
          ).map((key) => (
            <div key={key} className="rounded-lg border p-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {key.replaceAll("_", " ")}
              </p>
              <p className="font-semibold">
                {usage.usage[key]} / {formatPlanLimit(usage.limits[key])}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          AI spend this month (agent_runs): £
          {(usage.ai_spend_pence / 100).toFixed(2)}. AI run quotas count
          metered, non-failed runs only (see docs/finance.md).
        </p>
      </section>

      {!configured ? (
        <p className="text-sm text-muted-foreground">
          Set <code>STRIPE_SECRET_KEY</code> and price IDs to enable upgrades.
        </p>
      ) : usage.plan === "internal" ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          This organization is on the Internal plan. Stripe upgrades are
          disabled; change the plan in the Admin Portal if needed.
        </p>
      ) : canManage ? (
        <section className="grid gap-3 md:grid-cols-3">
          {BILLABLE_PLANS.map((plan) => {
            const limits = PLAN_LIMITS[plan as OrgPlan];
            const isCurrent = usage.plan === plan;
            return (
              <form
                key={plan}
                action={createCheckoutSession}
                className="space-y-2 rounded-xl border p-4"
              >
                <input type="hidden" name="plan" value={plan} />
                <p className="font-medium">{limits.label}</p>
                <p className="text-2xl font-semibold">
                  £{(limits.monthly_price_pence / 100).toFixed(0)}
                  <span className="text-sm font-normal text-muted-foreground">
                    /mo
                  </span>
                </p>
                <ul className="text-xs text-muted-foreground">
                  <li>{formatPlanLimit(limits.brands)} brands</li>
                  <li>{formatPlanLimit(limits.ai_runs_month)} AI runs/mo</li>
                  <li>{formatPlanLimit(limits.connected_channels)} channels</li>
                  <li>{formatPlanLimit(limits.team_members)} members</li>
                </ul>
                <Button type="submit" disabled={isCurrent} className="w-full">
                  {isCurrent ? "Current plan" : `Upgrade to ${limits.label}`}
                </Button>
              </form>
            );
          })}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">
          Ask an org owner/admin to change the plan.
        </p>
      )}

      {configured && canManage && org?.stripe_customer_id ? (
        <form action={createBillingPortalSession}>
          <Button type="submit" variant="outline">
            Manage subscription / downgrade (Stripe portal)
          </Button>
        </form>
      ) : null}

      <section className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Invoices</div>
        <ul className="divide-y">
          {invoices.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">
              No invoices yet.
            </li>
          ) : (
            invoices.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {inv.number ?? inv.id} · {inv.status}
                  </p>
                  <p className="text-muted-foreground">
                    {new Date(inv.created * 1000).toLocaleDateString()} · £
                    {(inv.amount_due / 100).toFixed(2)}{" "}
                    {inv.currency.toUpperCase()}
                  </p>
                </div>
                {inv.hosted_invoice_url ? (
                  <a
                    href={inv.hosted_invoice_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    View
                  </a>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
