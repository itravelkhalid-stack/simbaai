"use client";

import { useActionState } from "react";

import { AskChart } from "@/components/data/analytics-charts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  askAnalytics,
  type DataActionResult,
} from "@/lib/data/actions";
import type { AnalyticsChatMessage } from "@/lib/types/analytics";

const initial: DataActionResult = {};

export function AskYourDataChat({
  brandId,
  messages,
}: {
  brandId: string;
  messages: AnalyticsChatMessage[];
}) {
  const [state, action, pending] = useActionState(askAnalytics, initial);
  const latestChart =
    state.chart ??
    [...messages].reverse().find((m) => m.role === "assistant" && m.chart)
      ?.chart ??
    null;

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-medium">Ask your data</p>
        <p className="text-xs text-muted-foreground">
          Natural-language questions run through a whitelisted, org-scoped query
          layer — never raw SQL.
        </p>
      </div>
      <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
        {messages.length === 0 ? (
          <p className="text-muted-foreground">
            Try: “Which channel had the best ROAS last month?” or “Compare
            Instagram engagement this month vs last.”
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={
                m.role === "user"
                  ? "rounded-lg bg-muted/60 px-3 py-2"
                  : "rounded-lg border px-3 py-2"
              }
            >
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {m.role === "user" ? "You" : "Analyst"}
              </p>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === "assistant" && m.chart ? (
                <AskChart chart={m.chart} />
              ) : null}
            </div>
          ))
        )}
      </div>
      {state.answer && !messages.some((m) => m.content === state.answer) ? (
        <div className="rounded-lg border px-3 py-2 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Analyst
          </p>
          <p className="whitespace-pre-wrap">{state.answer}</p>
          {latestChart ? <AskChart chart={latestChart} /> : null}
        </div>
      ) : null}
      <form action={action} className="flex gap-2">
        <input type="hidden" name="brandId" value={brandId} />
        <input
          name="question"
          placeholder="Which channel had the best ROAS last month?"
          className="flex h-9 flex-1 rounded-md border bg-transparent px-3 text-sm"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? "…" : "Ask"}
        </Button>
      </form>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
