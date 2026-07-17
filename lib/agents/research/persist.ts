import type { ResearchReport as ValidatedReport } from "@/lib/agents/prompts/research";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AgentRunLog } from "@/lib/types/research";

export async function appendAgentRunLog(
  runId: string,
  message: string,
  progress?: number,
  level: AgentRunLog["level"] = "info",
) {
  const supabase = createAdminClient();
  const { data: run, error } = await supabase
    .from("agent_runs")
    .select("logs, progress")
    .eq("id", runId)
    .single();

  if (error) throw new Error(error.message);

  const existingLogs = (run.logs as AgentRunLog[] | null) ?? [];
  const logs = [...existingLogs, { at: new Date().toISOString(), message, level }];

  const { error: updateError } = await supabase
    .from("agent_runs")
    .update({
      logs,
      progress: progress ?? run.progress,
      status: "running",
    })
    .eq("id", runId);

  if (updateError) throw new Error(updateError.message);
}

export async function persistResearchReport(params: {
  organizationId: string;
  projectId: string;
  runId: string;
  report: ValidatedReport;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costPence: number;
  durationMs: number;
}) {
  const supabase = createAdminClient();

  await supabase.from("research_documents").delete().eq("project_id", params.projectId);

  const docs = [
    {
      organization_id: params.organizationId,
      project_id: params.projectId,
      section: "executive_summary",
      content: params.report.executive_summary,
      sources: [],
      confidence: null,
      sort_order: 0,
    },
    {
      organization_id: params.organizationId,
      project_id: params.projectId,
      section: "recommended_actions",
      content: params.report.recommended_actions.map((a) => `- ${a}`).join("\n"),
      sources: [],
      confidence: null,
      sort_order: 1,
    },
    ...params.report.sections.map((section, index) => ({
      organization_id: params.organizationId,
      project_id: params.projectId,
      section: section.section,
      content: section.content,
      sources: section.sources,
      confidence: section.confidence ?? null,
      sort_order: index + 2,
    })),
  ];

  const { error: docsError } = await supabase.from("research_documents").insert(docs);
  if (docsError) throw new Error(docsError.message);

  const { error: runError } = await supabase
    .from("agent_runs")
    .update({
      status: "complete",
      progress: 100,
      model: params.model,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      cost_pence: params.costPence,
      duration_ms: params.durationMs,
      output: {
        executive_summary: params.report.executive_summary,
        recommended_actions: params.report.recommended_actions,
        structured: params.report.structured,
      },
      error: null,
    })
    .eq("id", params.runId);

  if (runError) throw new Error(runError.message);

  const { error: projectError } = await supabase
    .from("research_projects")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
      latest_agent_run_id: params.runId,
    })
    .eq("id", params.projectId);

  if (projectError) throw new Error(projectError.message);
}

export async function markResearchFailed(params: {
  projectId: string;
  runId: string;
  error: string;
}) {
  const supabase = createAdminClient();
  await appendAgentRunLog(params.runId, params.error, undefined, "error");

  await supabase
    .from("agent_runs")
    .update({ status: "failed", error: params.error, progress: 100 })
    .eq("id", params.runId);

  await supabase
    .from("research_projects")
    .update({ status: "failed" })
    .eq("id", params.projectId);
}
