import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { DepartmentCard } from "@/components/team/department-card";
import { CeoHireProposals } from "@/components/team/ceo-hire-proposals";
import { MetricCard } from "@/components/brand/metric-card";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import {
  loadDepartmentStats,
  loadOrgTeamHeaderStats,
} from "@/lib/team/stats";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export default async function TeamPage() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const [header, departments, { data: hires }] = await Promise.all([
    loadOrgTeamHeaderStats(active.organization_id),
    loadDepartmentStats(active.organization_id),
    supabase
      .from("brand_agent_activations")
      .select("id, agent_id, mandate, proposed_reason, brand_id, status")
      .eq("organization_id", active.organization_id)
      .eq("status", "proposed")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="AI Team"
        description="Every real agent and job in Simba AI — live status from agent runs, organised by department."
        actions={
          <Link href="/ask" className={cn(buttonVariants())}>
            Ask the Team
          </Link>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Agents" value={String(header.totalAgents)} />
        <MetricCard label="Runs today" value={String(header.runsToday)} />
        <MetricCard
          label="Actions today"
          value={String(header.actionsToday)}
        />
        <MetricCard
          label="Failing"
          value={String(header.failingCount)}
          delta={header.failingCount > 0 ? "needs attention" : "all clear"}
          deltaTone={header.failingCount > 0 ? "down" : "up"}
        />
      </section>

      <CeoHireProposals proposals={hires ?? []} />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">
          Departments
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <DepartmentCard key={d.department} stats={d} />
          ))}
        </div>
      </section>
    </div>
  );
}
