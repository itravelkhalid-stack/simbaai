import Link from "next/link";

import { CreatePlanForm } from "@/components/planning/create-plan-form";
import { PlanningNav } from "@/components/planning/planning-nav";
import { markNotificationRead } from "@/lib/planning/actions";
import { Button } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  Campaign,
  MarketingPlan,
  Notification,
} from "@/lib/types/planning";

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
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Planning</h1>
        <p className="mt-2 text-muted-foreground">
          Strategy → campaigns → tasks that execute across Content, Ads, Email, and SEO.
        </p>
      </div>
      <PlanningNav current="/planning" />

      {((notifications ?? []) as Notification[]).length ? (
        <div className="rounded-xl border p-4">
          <p className="mb-3 text-sm font-medium">Your task notifications</p>
          <ul className="space-y-2">
            {((notifications ?? []) as Notification[]).map((n) => (
              <li
                key={n.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div>
                  <p className="font-medium">{n.title}</p>
                  <p className="text-muted-foreground">{n.body}</p>
                </div>
                <div className="flex gap-2">
                  {n.link ? (
                    <Link href={n.link} className="underline">
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
        <div className="rounded-xl border">
          <div className="border-b p-3 text-sm font-medium">Recent plans</div>
          <ul className="divide-y">
            {((plans ?? []) as MarketingPlan[]).length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">No plans yet.</li>
            ) : (
              ((plans ?? []) as MarketingPlan[]).map((plan) => (
                <li key={plan.id} className="p-3 text-sm">
                  <Link
                    href={`/planning/plans/${plan.id}`}
                    className="font-medium underline"
                  >
                    {plan.title}
                  </Link>
                  <p className="text-muted-foreground">
                    {plan.status} · {plan.period_start} → {plan.period_end}
                  </p>
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-xl border">
          <div className="border-b p-3 text-sm font-medium">Campaigns</div>
          <ul className="divide-y">
            {((campaigns ?? []) as Campaign[]).length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">
                Approve a plan to create campaigns.
              </li>
            ) : (
              ((campaigns ?? []) as Campaign[]).map((c) => (
                <li key={c.id} className="p-3 text-sm">
                  <Link
                    href={`/planning/campaigns/${c.id}`}
                    className="font-medium underline"
                  >
                    {c.name}
                  </Link>
                  <p className="text-muted-foreground">
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
