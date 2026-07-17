import Link from "next/link";

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Marketing plans</h1>
        <p className="mt-2 text-muted-foreground">
          Approve sections, then materialize campaigns and executable tasks.
        </p>
      </div>
      <PlanningNav current="/planning/plans" />
      <CreatePlanForm />
      <ul className="divide-y rounded-xl border">
        {((data ?? []) as MarketingPlan[]).map((plan) => (
          <li key={plan.id} className="p-4">
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
    </div>
  );
}
