"use client";

import { useActionState } from "react";

import {
  createPlanWithAi,
  type PlanningActionResult,
} from "@/lib/planning/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldSelectClass } from "@/lib/ui/field";

const initial: PlanningActionResult = {};

export function CreatePlanForm() {
  const [state, action, pending] = useActionState(createPlanWithAi, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div className="space-y-2">
        <Label htmlFor="goalBrief">Business goal</Label>
        <Textarea
          id="goalBrief"
          name="goalBrief"
          rows={3}
          placeholder="Grow monthly sales from £50k to £80k in Q1"
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="periodType">Period</Label>
          <select
            id="periodType"
            name="periodType"
            className={fieldSelectClass}
            defaultValue="quarter"
          >
            <option value="quarter">Quarter</option>
            <option value="month">Month</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="budget">Budget (£)</Label>
          <Input id="budget" name="budget" type="number" min={0} step="100" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="periodStart">Period start</Label>
          <Input id="periodStart" name="periodStart" type="date" />
        </div>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Planning…" : "Generate marketing plan"}
      </Button>
    </form>
  );
}
