"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import {
  runAgentNow,
  type TeamActionResult,
} from "@/lib/team/run-actions";

const initial: TeamActionResult = {};

export function RunAgentButton({
  agentId,
  brandId,
  brands,
}: {
  agentId: string;
  brandId?: string;
  brands: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(runAgentNow, initial);
  const needsBrand = brands.length > 0 && !brandId;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="agentId" value={agentId} />
      {brandId ? (
        <input type="hidden" name="brandId" value={brandId} />
      ) : needsBrand ? (
        <select
          name="brandId"
          required
          className="h-9 rounded-full border border-border bg-card px-3 text-sm text-ink"
          defaultValue=""
        >
          <option value="" disabled>
            Brand…
          </option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      ) : null}
      <Button type="submit" size="sm" disabled={pending} variant="default">
        {pending ? "Running…" : "Run now"}
      </Button>
      {state.error ? (
        <span className="text-xs text-danger">{state.error}</span>
      ) : null}
      {state.success ? (
        <span className="text-xs text-ink-soft">{state.success}</span>
      ) : null}
    </form>
  );
}
