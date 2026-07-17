"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { AgentRun } from "@/lib/types/database";
import type { AgentRunLog } from "@/lib/types/research";
import { Progress } from "@/components/ui/progress";

export function ResearchRunProgress({
  runId,
  initialRun,
}: {
  runId: string;
  initialRun: AgentRun;
}) {
  const [run, setRun] = useState(initialRun);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`agent-run-${runId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "agent_runs",
          filter: `id=eq.${runId}`,
        },
        (payload) => {
          setRun(payload.new as AgentRun);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  const logs = (run.logs as AgentRunLog[] | null) ?? [];

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Agent run · {run.status}</p>
          <p className="text-xs text-muted-foreground">
            {run.model ?? "model pending"} · {run.tokens_in + run.tokens_out} tokens
            {run.cost_pence ? ` · ${run.cost_pence}p` : ""}
          </p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">{run.progress}%</p>
      </div>
      <Progress value={run.progress} />
      {run.error ? (
        <p className="text-sm text-destructive">{run.error}</p>
      ) : null}
      <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-3 text-xs">
        {logs.length === 0 ? (
          <p className="text-muted-foreground">Waiting for streamed logs…</p>
        ) : (
          logs.map((log, index) => (
            <div key={`${log.at}-${index}`} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">
                {new Date(log.at).toLocaleTimeString()}
              </span>
              <span className={log.level === "error" ? "text-destructive" : ""}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
