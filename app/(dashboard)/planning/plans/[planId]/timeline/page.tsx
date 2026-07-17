import { notFound } from "next/navigation";

import { CampaignGantt } from "@/components/planning/campaign-gantt";
import { PlanningNav } from "@/components/planning/planning-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Campaign, MarketingPlan } from "@/lib/types/planning";

export default async function PlanTimelinePage({
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
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("plan_id", planId)
    .order("start_date", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <PlanningNav current="/planning/timeline" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">
          Timeline · {p.title}
        </h1>
      </div>
      <CampaignGantt
        campaigns={(campaigns ?? []) as Campaign[]}
        periodStart={p.period_start}
        periodEnd={p.period_end}
      />
    </div>
  );
}
