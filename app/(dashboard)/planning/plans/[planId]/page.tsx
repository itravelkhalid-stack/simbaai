import Link from "next/link";
import { notFound } from "next/navigation";

import { PlanDocumentEditor } from "@/components/planning/plan-document-editor";
import { PlanningNav } from "@/components/planning/planning-nav";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { MarketingPlan } from "@/lib/types/planning";
import { cn } from "@/lib/utils";

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("marketing_plans")
    .select("*")
    .eq("id", planId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!plan) notFound();

  const p = plan as MarketingPlan;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <PlanningNav current="/planning/plans" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{p.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{p.goal_brief}</p>
        </div>
        {p.status === "active" ? (
          <Link
            href={`/planning/plans/${p.id}/timeline`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Timeline
          </Link>
        ) : null}
      </div>
      <PlanDocumentEditor plan={p} />
    </div>
  );
}
