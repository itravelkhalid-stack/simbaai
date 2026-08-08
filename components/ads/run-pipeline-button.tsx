"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  runFirstFlightPipelineAction,
  type PipelineActionResult,
} from "@/lib/ads/pipeline-actions";
import {
  isStaleServerActionError,
  STALE_SERVER_ACTION_USER_MESSAGE,
} from "@/lib/ui/stale-server-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: PipelineActionResult = {};

async function runPipelineAction(
  prev: PipelineActionResult,
  formData: FormData,
): Promise<PipelineActionResult> {
  try {
    return await runFirstFlightPipelineAction(prev, formData);
  } catch (error) {
    if (isStaleServerActionError(error)) {
      return { error: STALE_SERVER_ACTION_USER_MESSAGE, stale: true };
    }
    return {
      error:
        error instanceof Error ? error.message : "Pipeline failed unexpectedly",
    };
  }
}

export function RunPipelineButton({
  brandId,
  directiveId,
  dailyBudgetPence = 200,
}: {
  brandId: string;
  directiveId: string;
  dailyBudgetPence?: number;
}) {
  const [state, action, pending] = useActionState(runPipelineAction, initial);
  const dailyGbp = (dailyBudgetPence / 100).toFixed(0);

  return (
    <div className="space-y-2">
      <form action={action} className="inline-flex">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="directiveId" value={directiveId} />
        <input
          type="hidden"
          name="dailyBudgetPence"
          value={String(dailyBudgetPence)}
        />
        <Button type="submit" size="sm" disabled={pending}>
          {pending
            ? "Running pipeline…"
            : `Run pipeline (£${dailyGbp}/day)`}
        </Button>
      </form>
      {pending ? (
        <p className="text-xs text-ink-soft">
          Building brief → media plan → creatives → launch review. Often 1–3
          minutes — keep this tab open.
        </p>
      ) : null}
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription className="space-y-2">
            <p>{state.error || state.success}</p>
            {state.stoppedAt ? (
              <p className="text-xs opacity-80">Stopped at: {state.stoppedAt}</p>
            ) : null}
            <div className="flex flex-wrap gap-3 text-sm">
              {state.mediaPlanId ? (
                <Link
                  href={`/ads/plans/${state.mediaPlanId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open media plan
                </Link>
              ) : null}
              {state.campaignId ? (
                <Link
                  href={`/ads/campaigns/${state.campaignId}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open campaign
                </Link>
              ) : null}
              {state.stale ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Reload page
                </Button>
              ) : null}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
