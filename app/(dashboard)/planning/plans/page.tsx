import Link from "next/link";

import { EmptyState } from "@/components/brand/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreatePlanForm } from "@/components/planning/create-plan-form";
import { PlanningNav } from "@/components/planning/planning-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { MarketingPlan } from "@/lib/types/planning";

export default async function PlanningPlansPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketing_plans")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("created_at", { ascending: false });
  const plans = (data ?? []) as MarketingPlan[];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marketing plans"
        description="Approve sections, then materialize campaigns and executable tasks."
      />
      <PlanningNav current="/planning/plans" />
      <CreatePlanForm />
      {plans.length === 0 ? (
        <EmptyState
          title="Turn your next goal into a plan"
          description="Give Simba AI a business goal to create a focused marketing plan with campaigns and tasks."
        />
      ) : (
        <ul className="space-y-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="rounded-lg bg-card p-5 shadow-elevated ring-1 ring-border"
            >
              <Link href={`/planning/plans/${plan.id}`} className="font-medium underline">
                {plan.title}
              </Link>
              <p className="text-sm text-muted-foreground">
                {plan.status} · {plan.period_type} · {plan.period_start} →{" "}
                {plan.period_end}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
