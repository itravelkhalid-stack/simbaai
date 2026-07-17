import Link from "next/link";
import { notFound } from "next/navigation";

import { ResearchActions } from "@/components/research/research-actions";
import { ResearchReportView } from "@/components/research/report-view";
import { ResearchRunProgress } from "@/components/research/run-progress";
import { Badge } from "@/components/ui/badge";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { AgentRun } from "@/lib/types/database";
import {
  RESEARCH_TYPE_LABELS,
  researchFreshness,
  type ResearchDocument,
  type ResearchProject,
} from "@/lib/types/research";

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

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/research" className="text-sm text-muted-foreground underline">
          ← Research library
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {RESEARCH_TYPE_LABELS[typedProject.type]}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {typedProject.title}
            </h1>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{typedProject.status}</Badge>
            <Badge variant="secondary">{freshness.label}</Badge>
          </div>
        </div>
      </div>

      {run ? <ResearchRunProgress runId={run.id} initialRun={run} /> : null}

      {typedProject.status === "complete" ? (
        <>
          <ResearchActions
            project={typedProject}
            documents={(documents ?? []) as ResearchDocument[]}
            canWrite={canWrite}
          />
          <ResearchReportView
            title={typedProject.title}
            documents={(documents ?? []) as ResearchDocument[]}
          />
        </>
      ) : null}

      {typedProject.status === "failed" ? (
        <p className="text-sm text-destructive">
          This run failed{run?.error ? `: ${run.error}` : "."} Use Refresh to retry with
          prior context once available.
        </p>
      ) : null}
    </div>
  );
}
