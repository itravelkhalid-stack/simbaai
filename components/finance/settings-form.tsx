"use client";

import { useActionState } from "react";

import {
  saveFinanceSettings,
  type FinanceActionResult,
} from "@/lib/finance/actions";
import type { BrandFinanceSettings } from "@/lib/types/finance";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: FinanceActionResult = {};

export function FinanceSettingsForm({
  brandId,
  brandName,
  settings,
}: {
  brandId: string;
  brandName: string;
  settings: BrandFinanceSettings;
}) {
  const [state, action, pending] = useActionState(saveFinanceSettings, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <input type="hidden" name="brandId" value={brandId} />
      <p className="text-sm font-medium">{brandName}</p>
      <div className="space-y-2">
        <Label htmlFor={`cogs-${brandId}`}>Product COGS %</Label>
        <Input
          id={`cogs-${brandId}`}
          name="cogsPct"
          type="number"
          min={0}
          max={100}
          step="0.1"
          defaultValue={Number(settings.cogs_pct)}
        />
        <p className="text-xs text-muted-foreground">
          Used for gross margin on the marketing P&amp;L.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Currency</Label>
        <Input name="currency" defaultValue={settings.currency} />
      </div>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
