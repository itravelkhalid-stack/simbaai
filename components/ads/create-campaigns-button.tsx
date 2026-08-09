"use client";

import { useActionState } from "react";

import {
  createCampaignsPaused,
  type CreateCampaignsState,
} from "@/lib/ads/launch-actions";
import {
  isStaleServerActionError,
  STALE_SERVER_ACTION_USER_MESSAGE,
} from "@/lib/ui/stale-server-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: CreateCampaignsState = {};

async function createAction(
  prev: CreateCampaignsState,
  formData: FormData,
): Promise<CreateCampaignsState> {
  try {
    return await createCampaignsPaused(prev, formData);
  } catch (error) {
    if (isStaleServerActionError(error)) {
      return { error: STALE_SERVER_ACTION_USER_MESSAGE, stale: true };
    }
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to create paused campaigns",
      gate: "unknown",
    };
  }
}

export function CreateCampaignsButton({
  campaignId,
  finalUrl,
  countries,
  approvedCreativesCount,
  canWrite,
  persistedLastError,
}: {
  campaignId: string;
  finalUrl: string;
  countries: string;
  approvedCreativesCount: number;
  canWrite: boolean;
  persistedLastError?: string | null;
}) {
  const [state, action, pending] = useActionState(createAction, initial);
  const error = state.error ?? null;
  const success = state.success ?? null;

  return (
    <div className="space-y-3">
      {persistedLastError && !error ? (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger ring-1 ring-danger/25">
          <p className="font-medium">Last create error</p>
          <p>{persistedLastError}</p>
        </div>
      ) : null}

      <form action={action} className="space-y-3">
        <input type="hidden" name="campaignId" value={campaignId} />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="finalUrl">Final destination URL</Label>
            <Input
              id="finalUrl"
              name="finalUrl"
              type="url"
              required
              defaultValue={finalUrl}
              placeholder="https://example.com/offer"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="countries">Country codes</Label>
            <Input
              id="countries"
              name="countries"
              defaultValue={countries}
              placeholder="GB, US"
            />
          </div>
        </div>
        <p className="text-xs text-ink-soft">
          {approvedCreativesCount} approved creative(s). Meta requires one with
          an image. Google RSA requires 3 distinct headlines and 2 descriptions
          from approved variants. Launch review must be passed with CMO
          approval before create.
        </p>
        <Button
          type="submit"
          disabled={!canWrite || approvedCreativesCount === 0 || pending}
        >
          {pending ? "Creating PAUSED…" : "Create campaigns PAUSED"}
        </Button>
      </form>

      {error ? (
        <div className="space-y-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger ring-1 ring-danger/25">
          <p className="font-medium">
            Could not create campaigns
            {state.gate ? ` (${state.gate})` : ""}
          </p>
          <p>{error}</p>
          {state.fbtraceId ? (
            <p className="text-xs opacity-80">fbtrace_id={state.fbtraceId}</p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
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
            {state.gate === "launch_review" ||
            state.gate === "cmo_approval" ||
            state.gate === "creatives" ? (
              <p className="text-xs text-ink-soft">
                Fix issues in Pipeline record / Approvals above, then retry.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg bg-success-soft px-3 py-2 text-sm text-ink ring-1 ring-success/30">
          <p>{success}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => window.location.reload()}
          >
            Reload to refresh status
          </Button>
        </div>
      ) : null}
    </div>
  );
}
