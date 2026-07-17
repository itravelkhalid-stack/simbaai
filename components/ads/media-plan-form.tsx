"use client";

import { useActionState } from "react";

import {
  createMediaPlanWithAi,
  type AdsActionResult,
} from "@/lib/ads/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: AdsActionResult = {};

export function MediaPlanForm() {
  const [state, action, pending] = useActionState(createMediaPlanWithAi, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div className="space-y-2">
        <Label htmlFor="goalBrief">Goal brief</Label>
        <Textarea
          id="goalBrief"
          name="goalBrief"
          rows={4}
          placeholder="£3,000/month budget, goal: purchases, target ROAS 3x"
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="monthlyBudget">Monthly budget (£)</Label>
          <Input
            id="monthlyBudget"
            name="monthlyBudget"
            type="number"
            min={1}
            step="0.01"
            defaultValue={3000}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="targetRoas">Target ROAS</Label>
          <Input
            id="targetRoas"
            name="targetRoas"
            type="number"
            min={0}
            step="0.1"
            defaultValue={3}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="objective">Objective</Label>
          <Input id="objective" name="objective" defaultValue="purchases" />
        </div>
      </div>
      <input type="hidden" name="currency" value="GBP" />
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Building plan…" : "Generate media plan"}
      </Button>
    </form>
  );
}
