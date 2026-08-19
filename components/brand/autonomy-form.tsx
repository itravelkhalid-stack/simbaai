"use client";

import { useActionState } from "react";

import { saveBrandAutonomy, type BrandActionResult } from "@/lib/brand/actions";
import type { BrandAutonomySettings } from "@/lib/autonomy/settings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: BrandActionResult = {};

function channelValue(
  settings: BrandAutonomySettings,
  channel: "ads" | "organic_social" | "email",
) {
  return settings.channelModes[channel] ?? "inherit";
}

export function BrandAutonomyForm({
  brandId,
  brandName,
  settings,
  canWrite,
  monthlyAdBudgetPence = null,
  monthlyAdBudgetCurrency = "GBP",
}: {
  brandId: string;
  brandName: string;
  settings: BrandAutonomySettings;
  canWrite: boolean;
  monthlyAdBudgetPence?: number | null;
  monthlyAdBudgetCurrency?: string;
}) {
  const [state, action, pending] = useActionState(saveBrandAutonomy, initial);

  return (
    <form action={action} className="space-y-5 rounded-xl border p-5">
      <input type="hidden" name="brandId" value={brandId} />
      <div>
        <h2 className="text-lg font-medium">{brandName}</h2>
        <p className="text-sm text-muted-foreground">
          Approval mode queues outbound agent actions for humans. Autonomous mode
          lets agents execute within ads limits and organic compliance rules.
          For ads, set the monthly budget below — agents derive the rest.
        </p>
      </div>

      {settings.agentActivityPaused ? (
        <Alert variant="destructive">
          <AlertDescription>
            Agent activity is paused. Scheduled publishing and autonomous ads
            actions are halted until you turn this off.
          </AlertDescription>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? (
        <Alert>
          <AlertDescription>{state.success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`mode-${brandId}`}>Operating mode</Label>
        <select
          id={`mode-${brandId}`}
          name="autonomy_mode"
          defaultValue={settings.autonomyMode}
          disabled={!canWrite}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="approval">Approval (default)</option>
          <option value="autonomous">Autonomous</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["channel_ads", "Ads", channelValue(settings, "ads")],
            [
              "channel_organic_social",
              "Organic social",
              channelValue(settings, "organic_social"),
            ],
            ["channel_email", "Email", channelValue(settings, "email")],
          ] as const
        ).map(([name, label, value]) => (
          <div key={name} className="space-y-2">
            <Label htmlFor={`${name}-${brandId}`}>{label} override</Label>
            <select
              id={`${name}-${brandId}`}
              name={name}
              defaultValue={value}
              disabled={!canWrite}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="inherit">Inherit brand mode</option>
              <option value="approval">Approval</option>
              <option value="autonomous">Autonomous</option>
            </select>
          </div>
        ))}
      </div>

      <div className="space-y-2 rounded-lg border border-brand/30 bg-brand-soft/30 p-3">
        <Label htmlFor={`budget-${brandId}`}>Monthly ad budget (£)</Label>
        <Input
          id={`budget-${brandId}`}
          name="monthly_ad_budget_major"
          type="number"
          step="1"
          min="0"
          defaultValue={
            monthlyAdBudgetPence != null
              ? (monthlyAdBudgetPence / 100).toFixed(0)
              : ""
          }
          disabled={!canWrite}
          placeholder="e.g. 3000"
        />
        <input
          type="hidden"
          name="monthly_ad_budget_currency"
          value={monthlyAdBudgetCurrency || "GBP"}
        />
        <p className="text-xs text-muted-foreground">
          Default combined monthly pot across all ad platforms (not per-platform).
          Prefer Ads → Budgets for per-month schedule (e.g. Aug £500, Sep £800) and
          optional Meta/Google splits. Daily pacing = monthly/30 ±20%, always capped
          by Ads → Settings org limits. Leave blank to disable the default fallback.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`roas-${brandId}`}>Min ROAS (autonomous pause)</Label>
          <Input
            id={`roas-${brandId}`}
            name="autonomy_min_roas"
            type="number"
            step="0.1"
            min="0"
            defaultValue={settings.minRoas}
            disabled={!canWrite}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`cpa-${brandId}`}>Max CPA £ (autonomous pause)</Label>
          <Input
            id={`cpa-${brandId}`}
            name="autonomy_max_cpa_major"
            type="number"
            step="0.01"
            min="0"
            defaultValue={(settings.maxCpaPence / 100).toFixed(2)}
            disabled={!canWrite}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <input
          type="checkbox"
          name="agent_activity_paused"
          value="on"
          defaultChecked={settings.agentActivityPaused}
          disabled={!canWrite}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-destructive">
            Pause all agent activity
          </span>
          <span className="mt-1 block text-muted-foreground">
            Immediate kill switch for this brand. Halts all scheduled AI work
            (CEO checks, meetings, reports, cadence fill, CMO, planning tasks,
            research, retries) and blocks autonomous publishing until you turn
            this off.
          </span>
        </span>
      </label>

      {canWrite ? (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save autonomy settings"}
        </Button>
      ) : null}
    </form>
  );
}
