import { inngest } from "@/lib/inngest/client";
import { enqueueDeadLetter, markDeadLetter } from "@/lib/jobs/dead-letter";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCircuitState, resetCircuits } from "@/lib/security/http";

/** Re-drive a failed agent run or mark DLQ resolved. */
export const jobsRetryAgentRun = inngest.createFunction(
  {
    id: "jobs/retry-agent-run",
    retries: 1,
    triggers: [{ event: "jobs/retry-agent-run" }],
  },
  async ({ event, step }) => {
    const { agentRunId, deadLetterId } = event.data as {
      agentRunId: string;
      deadLetterId?: string;
    };

    await step.run("reset-status", async () => {
      const supabase = createAdminClient();
      await supabase
        .from("agent_runs")
        .update({ status: "queued", error: null, progress: 0 })
        .eq("id", agentRunId);
    });

    if (deadLetterId) {
      await step.run("mark-dlq", async () => {
        await markDeadLetter(deadLetterId, "resolved");
      });
    }

    return { agentRunId, requeued: true };
  },
);

/** Record failed Inngest jobs into DLQ (call from onFailure wrappers). */
export async function recordJobFailure(params: {
  organizationId?: string | null;
  provider: string;
  jobName: string;
  eventName?: string;
  payload?: Record<string, unknown>;
  error: string;
  attempts?: number;
  agentRunId?: string | null;
}) {
  return enqueueDeadLetter(params);
}

/** Hourly: refresh integration_health from circuit breakers. */
export const jobsIntegrationHealth = inngest.createFunction(
  {
    id: "jobs/integration-health",
    retries: 1,
    triggers: [{ cron: "15 * * * *" }],
  },
  async ({ step }) => {
    return step.run("snapshot", async () => {
      const providers = [
        "anthropic",
        "stripe",
        "resend",
        "meta",
        "tiktok",
        "google",
        "x",
        "microsoft",
      ];
      const supabase = createAdminClient();
      for (const provider of providers) {
        const state = getCircuitState(provider);
        const status =
          state === "open" ? "down" : state === "half_open" ? "degraded" : "ok";
        await supabase.from("integration_health").upsert({
          provider,
          status,
          detail:
            status === "ok"
              ? null
              : `Circuit breaker ${state} — external calls paused or probing.`,
          checked_at: new Date().toISOString(),
        });
      }
      return { providers: providers.length };
    });
  },
);

export const jobsFunctions = [jobsRetryAgentRun, jobsIntegrationHealth];

/** Test helper re-export */
export { resetCircuits };
