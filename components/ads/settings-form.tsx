"use client";

import { useActionState } from "react";

import { saveAdsOrgSettings, type AdsActionResult } from "@/lib/ads/actions";
import type { AdsOrgSettingsResolved } from "@/lib/ads/settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AdsActionResult = {};

export function AdsSettingsForm({ settings }: { settings: AdsOrgSettingsResolved }) {
  const [state, action, pending] = useActionState(saveAdsOrgSettings, initial);

  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="autoOptimise"
          defaultChecked={settings.auto_optimise}
        />
        Enable auto-optimise (budget shifts only, within daily cap)
      </label>
      <div className="space-y-2">
        <Label htmlFor="maxDailyChange">Max daily budget change (£)</Label>
        <Input
          id="maxDailyChange"
          name="maxDailyChange"
          type="number"
          min={0}
          step="1"
          defaultValue={settings.max_daily_budget_change_pence / 100}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currency">Currency</Label>
        <Input id="currency" name="currency" defaultValue={settings.currency} />
      </div>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}
