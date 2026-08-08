"use client";

import { useActionState } from "react";

import { saveOrgAdLimits } from "@/lib/ads/launch-actions";
import type { OrgAdLimits } from "@/lib/types/ads";
import {
  isStaleServerActionError,
  STALE_SERVER_ACTION_USER_MESSAGE,
} from "@/lib/ui/stale-server-action";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LimitsActionResult = {
  error?: string;
  success?: string;
  stale?: boolean;
};

const initial: LimitsActionResult = {};

async function saveLimitsAction(
  prev: LimitsActionResult,
  formData: FormData,
): Promise<LimitsActionResult> {
  try {
    return await saveOrgAdLimits(prev, formData);
  } catch (error) {
    if (isStaleServerActionError(error)) {
      return { error: STALE_SERVER_ACTION_USER_MESSAGE, stale: true };
    }
    return {
      error:
        error instanceof Error ? error.message : "Failed to save hard limits",
    };
  }
}

export function AdLimitsForm({
  limits,
  brandId,
  brandName,
}: {
  limits: OrgAdLimits | null;
  brandId?: string;
  brandName?: string;
}) {
  const [state, action, pending] = useActionState(saveLimitsAction, initial);
  const formKey = brandId ?? "org";
  // Org defaults pause-on for fail-closed. Brand overrides default pause-off so
  // saving a new brand row does not invent a brand-level kill switch.
  const defaultPaused = brandId
    ? (limits?.writes_paused ?? false)
    : (limits?.writes_paused ?? true);

  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      {brandId ? <input type="hidden" name="brandId" value={brandId} /> : null}
      <div>
        <h2 className="font-medium">
          {brandName ? `${brandName} limits` : "Organization hard limits"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {brandName
            ? "Optional stricter brand override; effective limits are the lower of organization and brand. Master pause at either level blocks writes."
            : "Checked server-side before every platform mutation. Missing limits block all writes. TikTok, X, and Bing remain blocked."}
        </p>
      </div>
      {!limits && !brandId ? (
        <Alert variant="destructive">
          <AlertDescription>
            No limits configured: all remote ad writes are currently blocked.
          </AlertDescription>
        </Alert>
      ) : !limits && brandId ? (
        <Alert>
          <AlertDescription>
            No brand override configured; organization limits currently apply.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`maxDailySpendMajor-${formKey}`}>
            Maximum active daily spend (£)
          </Label>
          <Input
            id={`maxDailySpendMajor-${formKey}`}
            name="maxDailySpendMajor"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={(limits?.max_daily_spend_pence ?? 500) / 100}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`maxSingleMajor-${formKey}`}>
            Maximum one-campaign daily budget (£)
          </Label>
          <Input
            id={`maxSingleMajor-${formKey}`}
            name="maxSingleMajor"
            type="number"
            min={0}
            step="0.01"
            required
            defaultValue={
              (limits?.max_single_campaign_daily_budget_pence ?? 200) / 100
            }
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="writesPaused"
          defaultChecked={defaultPaused}
        />
        Master pause: block creates, launches, and budget increases
      </label>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="killMeta"
            defaultChecked={limits?.platform_kill_switches?.meta ?? false}
          />
          Kill switch: Meta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="killGoogle"
            defaultChecked={limits?.platform_kill_switches?.google ?? false}
          />
          Kill switch: Google
        </label>
      </div>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{state.error || state.success}</span>
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
          </AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save hard limits"}
      </Button>
    </form>
  );
}
