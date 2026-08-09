"use client";

import { useActionState, type ReactNode } from "react";

import type { AdsMutateState } from "@/lib/ads/launch-actions";
import {
  isStaleServerActionError,
  STALE_SERVER_ACTION_USER_MESSAGE,
} from "@/lib/ui/stale-server-action";
import { Button } from "@/components/ui/button";

const initial: AdsMutateState = {};

export function AdsMutateForm({
  action: serverAction,
  className,
  children,
}: {
  action: (
    prev: AdsMutateState,
    formData: FormData,
  ) => Promise<AdsMutateState>;
  className?: string;
  children: ReactNode;
}) {
  async function boundAction(
    prev: AdsMutateState,
    formData: FormData,
  ): Promise<AdsMutateState> {
    try {
      return await serverAction(prev, formData);
    } catch (error) {
      if (isStaleServerActionError(error)) {
        return { error: STALE_SERVER_ACTION_USER_MESSAGE, stale: true };
      }
      return {
        error:
          error instanceof Error ? error.message : "Ads action failed",
        gate: "unknown",
      };
    }
  }

  const [state, action, pending] = useActionState(boundAction, initial);

  return (
    <div className="space-y-2">
      <form action={action} className={className}>
        {children}
      </form>
      {pending ? (
        <p className="text-xs text-ink-soft">Working…</p>
      ) : null}
      {state.error ? (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger ring-1 ring-danger/25">
          <p>{state.error}</p>
          {state.stale ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          ) : null}
        </div>
      ) : null}
      {state.success ? (
        <div className="rounded-lg bg-success-soft px-3 py-2 text-sm text-ink ring-1 ring-success/30">
          <p>{state.success}</p>
        </div>
      ) : null}
    </div>
  );
}
