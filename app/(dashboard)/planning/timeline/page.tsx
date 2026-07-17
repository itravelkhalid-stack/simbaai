import { CampaignGantt } from "@/components/planning/campaign-gantt";
import { PlanningNav } from "@/components/planning/planning-nav";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Campaign } from "@/lib/types/planning";

export default async function PlanningTimelinePage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("*")
    .eq("organization_id", active.organization_id)
    .order("start_date", { ascending: true });

  const list = (campaigns ?? []) as Campaign[];
  const starts = list
    .map((c) => c.start_date)
    .filter(Boolean)
    .sort() as string[];
  const ends = list
    .map((c) => c.end_date)
    .filter(Boolean)
    .sort() as string[];
  const periodStart =
    starts[0] ?? new Date().toISOString().slice(0, 10);
  const periodEnd =
    ends[ends.length - 1] ??
    new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Timeline</h1>
        <p className="mt-2 text-muted-foreground">
          Gantt-style view of all campaigns across the planning period.
        </p>
      </div>
      <PlanningNav current="/planning/timeline" />
      <CampaignGantt
        campaigns={list}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />
    </div>
  );
}
