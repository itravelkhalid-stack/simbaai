import Link from "next/link";
import { notFound } from "next/navigation";

import { ErrorState } from "@/components/brand/error-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResearchActions } from "@/components/research/research-actions";
import { ResearchReportView } from "@/components/research/report-view";
import { ResearchRunProgress } from "@/components/research/run-progress";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun } from "@/lib/types/database";
import {
  RESEARCH_TYPE_LABELS,
  researchFreshness,
  type ResearchDocument,
  type ResearchProject,
} from "@/lib/types/research";
import { statusTone } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

export default async function ResearchProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: project, error } = await supabase
    .from("research_projects")
    .select("*")
    .eq("id", projectId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!project) notFound();

  const typedProject = project as ResearchProject;
  const freshness = researchFreshness(typedProject.completed_at);

  let run: AgentRun | null = null;
  if (typedProject.latest_agent_run_id) {
    const { data: runData, error: runError } = await supabase
      .from("agent_runs")
      .select("*")
      .eq("id", typedProject.latest_agent_run_id)
      .eq("organization_id", active.organization_id)
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    run = runData;
  }

  const { data: documents, error: docsError } = await supabase
    .from("research_documents")
    .select("*")
    .eq("project_id", typedProject.id)
    .eq("organization_id", active.organization_id)
    .order("sort_order", { ascending: true });

  if (docsError) throw new Error(docsError.message);

  const canWrite = active.role !== "org_viewer";

  const { data: brand } = typedProject.brand_id
    ? await supabase
        .from("brands")
        .select("name, primary_color")
        .eq("id", typedProject.brand_id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-6">
      <PageHeader
        title={typedProject.title}
        description={RESEARCH_TYPE_LABELS[typedProject.type]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusTone(typedProject.status)}>
              {typedProject.status}
            </Badge>
            <Badge variant="neutral">{freshness.label}</Badge>
            <Link
              href="/research"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Library
            </Link>
          </div>
        }
      />

      {run ? <ResearchRunProgress runId={run.id} initialRun={run} /> : null}

      {typedProject.status === "complete" ? (
        <>
          <ResearchActions
            project={typedProject}
            documents={(documents ?? []) as ResearchDocument[]}
            canWrite={canWrite}
            brandName={brand?.name ?? active.organization.name}
            primaryColor={brand?.primary_color}
          />
          <ResearchReportView
            title={typedProject.title}
            documents={(documents ?? []) as ResearchDocument[]}
          />
        </>
      ) : null}

      {typedProject.status === "failed" ? (
        <ErrorState
          title="Research run failed"
          description={
            run?.error
              ? `Simba couldn't finish this report: ${run.error}`
              : "Simba couldn't finish this report. Refresh to retry with prior context."
          }
          retryHref={`/research/${typedProject.id}`}
        />
      ) : null}
    </div>
  );
}
