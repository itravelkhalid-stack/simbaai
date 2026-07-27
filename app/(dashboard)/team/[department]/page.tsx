import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { AgentCard } from "@/components/team/agent-card";
import { buttonVariants } from "@/components/ui/button";
import {
  DEPARTMENT_META,
  getAgentsByDepartment,
  isAgentDepartment,
} from "@/lib/agents/registry";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { loadAgentLiveStats } from "@/lib/team/stats";
import { cn } from "@/lib/utils";

export default async function TeamDepartmentPage({
  params,
}: {
  params: Promise<{ department: string }>;
}) {
  const { department: raw } = await params;
  if (!isAgentDepartment(raw)) notFound();

  const { active } = await requireActiveOrg();
  const meta = DEPARTMENT_META[raw];
  const entries = getAgentsByDepartment(raw);
  const supabase = await createClient();

  const [{ data: brands }, stats] = await Promise.all([
    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", active.organization_id)
      .order("name"),
    loadAgentLiveStats(active.organization_id, entries),
  ]);

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href="/team" className="text-ink-soft hover:text-primary">
          ← AI Team
        </Link>
      </div>
      <PageHeader
        title={meta.label}
        description={meta.blurb}
        actions={
          <Link
            href={meta.href}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Open module
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map((s) => (
          <AgentCard
            key={s.entry.id}
            stats={s}
            brands={brands ?? []}
          />
        ))}
      </div>
    </div>
  );
}
