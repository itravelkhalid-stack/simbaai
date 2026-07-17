"use client";

import { useActionState } from "react";

import {
  saveAutomationSettings,
  type AutomationsActionResult,
} from "@/lib/automations/actions";
import type { BrandAutomationSettings } from "@/lib/types/automations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AutomationsActionResult = {};

const CHANNELS = ["content", "email", "ads", "social"] as const;

export function AutomationSettingsForm({
  brandId,
  settings,
}: {
  brandId: string;
  settings: BrandAutomationSettings;
}) {
  const [state, action, pending] = useActionState(
    saveAutomationSettings,
    initial,
  );

  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <input type="hidden" name="brandId" value={brandId} />
      <div>
        <p className="text-sm font-medium">Auto-publish channels</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Without these, publish/send/resume actions route to approvals instead of
          going live.
        </p>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((ch) => (
            <label key={ch} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="auto_publish_channels"
                value={ch}
                defaultChecked={(settings.auto_publish_channels ?? []).includes(
                  ch,
                )}
              />
              {ch}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="daily_budget_cap">
          Daily budget-affecting action cap (£)
        </Label>
        <Input
          id="daily_budget_cap"
          name="daily_budget_cap"
          type="number"
          step="1"
          defaultValue={Math.round(
            (settings.daily_budget_action_cap_pence ?? 50000) / 100,
          )}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slack_webhook_url">Slack webhook URL (optional)</Label>
        <Input
          id="slack_webhook_url"
          name="slack_webhook_url"
          defaultValue={settings.slack_webhook_url ?? ""}
          placeholder="https://hooks.slack.com/..."
        />
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
