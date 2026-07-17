import { createAdminClient } from "@/lib/supabase/admin";

export type DeadLetterInput = {
  organizationId?: string | null;
  provider: string;
  jobName: string;
  eventName?: string;
  payload?: Record<string, unknown>;
  error: string;
  attempts?: number;
  agentRunId?: string | null;
};

export async function enqueueDeadLetter(input: DeadLetterInput) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("job_dead_letters")
    .insert({
      organization_id: input.organizationId ?? null,
      provider: input.provider,
      job_name: input.jobName,
      event_name: input.eventName ?? null,
      payload: input.payload ?? {},
      error: input.error,
      attempts: input.attempts ?? 0,
      status: "open",
      agent_run_id: input.agentRunId ?? null,
      last_error_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    console.error("dead letter insert failed", error.message);
    return null;
  }
  return data.id as string;
}

export async function listOpenDeadLetters(limit = 50) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("job_dead_letters")
    .select("*")
    .in("status", ["open", "retrying"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function markDeadLetter(
  id: string,
  status: "resolved" | "discarded" | "retrying",
  userId?: string,
) {
  const supabase = createAdminClient();
  await supabase
    .from("job_dead_letters")
    .update({
      status,
      resolved_at:
        status === "resolved" || status === "discarded"
          ? new Date().toISOString()
          : null,
      resolved_by: userId ?? null,
    })
    .eq("id", id);
}
