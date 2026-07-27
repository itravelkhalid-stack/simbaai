import Link from "next/link";

import { EmptyState } from "@/components/brand/empty-state";
import { CreatePlanForm } from "@/components/planning/create-plan-form";
import { PlanningNav } from "@/components/planning/planning-nav";
import { markNotificationRead } from "@/lib/planning/actions";
import { Button } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import type {
  Campaign,
  MarketingPlan,
  Notification,
} from "@/lib/types/planning";
import { statusTone } from "@/lib/ui/status";
import { Badge } from "@/components/ui/badge";

export default async function PlanningHomePage() {
  const { user, active } = await requireActiveOrg();
  const supabase = await createClient();

  const [{ data: plans }, { data: campaigns }, { data: notifications }] =
    await Promise.all([
      supabase
        .from("marketing_plans")
        .select("*")
        .eq("organization_id", active.organization_id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("campaigns")
        .select("*")
        .eq("organization_id", active.organization_id)
        .order("start_date", { ascending: true })
        .limit(8),
      supabase
        .from("notifications")
        .select("*")
        .eq("organization_id", active.organization_id)
        .eq("user_id", user.id)
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Planning"
        description={
          <>
            Strategy → campaigns → tasks that execute across Content, Ads, Email, and SEO.
          </>
        }
      />
      <PlanningNav current="/planning" />

      {((notifications ?? []) as Notification[]).length ? (
        <div className="rounded-lg bg-warning-soft p-5 ring-1 ring-warning/40">
          <p className="mb-3 font-heading text-sm font-semibold text-ink">
            Your task notifications
          </p>
          <ul className="space-y-2">
            {((notifications ?? []) as Notification[]).map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div>
                  <p className="font-medium text-ink">{n.title}</p>
                  <p className="text-ink-soft">{n.body}</p>
                </div>
                <div className="flex gap-2">
                  {n.link ? (
                    <Link href={n.link} className="font-medium text-primary">
                      Open
                    </Link>
                  ) : null}
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={n.id} />
                    <Button type="submit" size="xs" variant="outline">
                      Dismiss
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CreatePlanForm />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-card shadow-elevated ring-1 ring-border">
          <div className="border-b border-border px-4 py-3 font-heading text-sm font-semibold text-ink">
            Recent plans
          </div>
          <ul className="divide-y divide-border">
            {((plans ?? []) as MarketingPlan[]).length === 0 ? (
              <li>
                <EmptyState
                  title="Your first plan starts here"
                  description="Turn a business goal into campaigns and tasks Simba can execute across channels."
                  className="py-8"
                />
              </li>
            ) : (
              ((plans ?? []) as MarketingPlan[]).map((plan) => (
                <li key={plan.id} className="p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/planning/plans/${plan.id}`}
                      className="font-medium text-ink hover:text-primary"
                    >
                      {plan.title}
                    </Link>
                    <Badge variant={statusTone(plan.status)}>
                      {plan.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-ink-soft">
                    {plan.period_start} → {plan.period_end}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-lg bg-card shadow-elevated ring-1 ring-border">
          <div className="border-b border-border px-4 py-3 font-heading text-sm font-semibold text-ink">
            Campaigns
          </div>
          <ul className="divide-y divide-border">
            {((campaigns ?? []) as Campaign[]).length === 0 ? (
              <li>
                <EmptyState
                  title="Campaigns appear after approval"
                  description="Approve every plan section, then finalize to create executable campaigns."
                  className="py-8"
                />
              </li>
            ) : (
              ((campaigns ?? []) as Campaign[]).map((c) => (
                <li key={c.id} className="p-4 text-sm">
                  <Link
                    href={`/planning/campaigns/${c.id}`}
                    className="font-medium text-ink hover:text-primary"
                  >
                    {c.name}
                  </Link>
                  <p className="mt-1 text-ink-soft">
                    {c.status} · {(c.channels ?? []).join(", ")}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
