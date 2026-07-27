import "server-only";

import { isMeteredAgentName } from "@/lib/billing/metering";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Create a running agent_runs row, run work, always finalize complete/failed.
 */
export async function withAgentRun<T>(params: {
  organizationId: string;
  module: string;
  agentName: string;
  input?: Record<string, unknown>;
  model?: string;
  /** Override metering; default from isMeteredAgentName(agentName). */
  metered?: boolean;
  work: () => Promise<{
    data: T;
    model?: string;
    tokensIn?: number;
    tokensOut?: number;
    costPence?: number;
    output?: Record<string, unknown>;
  }>;
}): Promise<{ data: T; agentRunId: string }> {
  const supabase = createAdminClient();
  const started = Date.now();
  const metered = params.metered ?? isMeteredAgentName(params.agentName);
  const { data: run, error } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: params.module,
      agent_name: params.agentName,
      status: "running",
      input: params.input ?? {},
      progress: 5,
      model: params.model ?? null,
      metered,
    })
    .select("id")
    .single();
  if (error || !run) {
    throw new Error(error?.message ?? "Failed to create agent_runs row");
  }

  try {
    const result = await params.work();
    await supabase
      .from("agent_runs")
      .update({
        status: "complete",
        progress: 100,
        model: result.model ?? params.model ?? null,
        tokens_in: result.tokensIn ?? 0,
        tokens_out: result.tokensOut ?? 0,
        cost_pence: result.costPence ?? 0,
        duration_ms: Date.now() - started,
        output: result.output ?? { ok: true },
        error: null,
      })
      .eq("id", run.id);
    return { data: result.data, agentRunId: run.id };
  } catch (err) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        progress: 100,
        error: err instanceof Error ? err.message : String(err),
        duration_ms: Date.now() - started,
      })
      .eq("id", run.id);
    throw err;
  }
}
