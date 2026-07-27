"use client";

import { useActionState } from "react";

import {
  runMeetingNow,
  type MeetingsActionResult,
} from "@/lib/meetings/actions";
import { MEETING_TYPE_LABELS, type MeetingType } from "@/lib/types/meetings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldSelectClass } from "@/lib/ui/field";

const initial: MeetingsActionResult = {};

const TYPES: MeetingType[] = [
  "daily_standup",
  "weekly_marketing",
  "monthly_board",
  "quarterly_board",
  "annual_review",
  "adhoc",
];

export function RunMeetingForm({
  brands,
}: {
  brands: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(runMeetingNow, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">Run a meeting now</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brandId">Brand</Label>
          <select
            id="brandId"
            name="brandId"
            className={fieldSelectClass}
            required
            defaultValue={brands[0]?.id ?? ""}
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Type</Label>
          <select
            id="type"
            name="type"
            className={fieldSelectClass}
            defaultValue="daily_standup"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {MEETING_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Ad hoc title (optional)</Label>
        <Input id="title" name="title" placeholder="Optional custom title" />
      </div>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending || !brands.length}>
        {pending ? "Queuing…" : "Queue meeting"}
      </Button>
    </form>
  );
}
