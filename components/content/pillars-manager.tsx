"use client";

import { useActionState } from "react";

import { createPillar, type ContentActionResult } from "@/lib/content/actions";
import type { ContentPillar } from "@/lib/types/content";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: ContentActionResult = {};

export function PillarsManager({
  pillars,
  canWrite,
}: {
  pillars: ContentPillar[];
  canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(createPillar, initial);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border">
        <ul className="divide-y">
          {pillars.length === 0 ? (
            <li className="p-4 text-sm text-muted-foreground">No pillars yet.</li>
          ) : (
            pillars.map((pillar) => (
              <li key={pillar.id} className="flex items-start justify-between gap-3 p-4">
                <div>
                  <p className="font-medium">{pillar.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {pillar.description || "No description"}
                  </p>
                </div>
                <p className="text-sm tabular-nums">{pillar.target_pct}%</p>
              </li>
            ))
          )}
        </ul>
      </div>

      {canWrite ? (
        <form action={action} className="space-y-3 rounded-xl border p-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetPct">Target %</Label>
            <Input id="targetPct" name="targetPct" type="number" min={0} max={100} defaultValue={25} />
          </div>
          {state.error || state.success ? (
            <Alert variant={state.error ? "destructive" : "default"}>
              <AlertDescription>{state.error || state.success}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Add pillar"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
