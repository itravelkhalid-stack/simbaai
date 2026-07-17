import { notFound } from "next/navigation";

import { KpiProgressBars } from "@/components/planning/kpi-bars";
import { PlanningNav } from "@/components/planning/planning-nav";
import { TaskKanban } from "@/components/planning/task-kanban";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { refreshCampaignKpis } from "@/lib/planning/execution";
import type {
  Campaign,
  CampaignActivity,
  CampaignTask,
  PlanKpi,
} from "@/lib/types/planning";

function formatPence(pence: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(pence / 100);
}

export default async function CampaignHubPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!campaign) notFound();

  let c = campaign as Campaign;
  try {
    const refreshed = await refreshCampaignKpis(c);
    c = { ...c, kpi: refreshed.kpis as PlanKpi[], spent_pence: refreshed.spent };
  } catch {
    // keep stored values
  }

  const [{ data: tasks }, { data: activities }] = await Promise.all([
    supabase
      .from("campaign_tasks")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("sort_order"),
    supabase
      .from("campaign_activities")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const budgetPct =
    c.budget_pence > 0
      ? Math.min(Math.round((c.spent_pence / c.budget_pence) * 100), 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <PlanningNav current="/planning/campaigns" />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{c.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {c.goal || "No goal set"} · {c.status}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4">
          <p className="mb-3 text-sm font-medium">KPI progress</p>
          <KpiProgressBars kpis={(c.kpi ?? []) as PlanKpi[]} />
        </div>
        <div className="rounded-xl border p-4">
          <p className="mb-3 text-sm font-medium">Budget</p>
          <p className="text-2xl font-semibold">
            {formatPence(c.spent_pence, c.currency)}{" "}
            <span className="text-base text-muted-foreground">
              / {formatPence(c.budget_pence, c.currency)}
            </span>
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground"
              style={{ width: `${budgetPct}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Channels: {(c.channels ?? []).join(", ") || "—"}
          </p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium">Tasks</p>
        <TaskKanban tasks={(tasks ?? []) as CampaignTask[]} />
      </div>

      <div className="rounded-xl border">
        <div className="border-b p-3 text-sm font-medium">Activity</div>
        <ul className="divide-y">
          {((activities ?? []) as CampaignActivity[]).length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">No activity yet.</li>
          ) : (
            ((activities ?? []) as CampaignActivity[]).map((a) => (
              <li key={a.id} className="p-3 text-sm">
                <p>{a.message}</p>
                <p className="text-xs text-muted-foreground">
                  {a.actor_type} · {new Date(a.created_at).toLocaleString()}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
