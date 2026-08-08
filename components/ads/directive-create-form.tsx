"use client";

import { useActionState } from "react";

import {
  createAdDirective,
  type DirectiveActionResult,
} from "@/lib/ads/directives-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldSelectClass } from "@/lib/ui/field";

const initial: DirectiveActionResult = {};

export function DirectiveCreateForm({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const [state, action, pending] = useActionState(createAdDirective, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div>
        <h2 className="text-sm font-medium">New directive — {brandName}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Binding on the next media plan. Scope destination / area / hotel, or
          leave open for AI selection from seasonality.
        </p>
      </div>
      <input type="hidden" name="brandId" value={brandId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="scope">Scope</Label>
          <select
            id="scope"
            name="scope"
            className={fieldSelectClass}
            defaultValue="destination"
            required
          >
            <option value="destination">Destination</option>
            <option value="area">Area</option>
            <option value="hotel">Specific hotel</option>
            <option value="open">Open (AI chooses)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="budgetSharePct">Budget share % (optional)</Label>
          <Input
            id="budgetSharePct"
            name="budgetSharePct"
            type="number"
            min={1}
            max={100}
            step="1"
            placeholder="e.g. 40"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          placeholder="Hotels in Dubai — summer push"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="focusText">Focus</Label>
        <Input
          id="focusText"
          name="focusText"
          required
          placeholder="hotels in Dubai"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="destinationSlug">Destination slug</Label>
          <Input
            id="destinationSlug"
            name="destinationSlug"
            placeholder="dubai"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="areaText">Area</Label>
          <Input id="areaText" name="areaText" placeholder="Jumeirah Beach" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hotelName">Hotel</Label>
          <Input
            id="hotelName"
            name="hotelName"
            placeholder="Atlantis The Palm"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="startsOn">Starts</Label>
          <Input id="startsOn" name="startsOn" type="date" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="endsOn">Ends</Label>
          <Input id="endsOn" name="endsOn" type="date" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Input id="notes" name="notes" placeholder="Optional steering notes" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Create directive"}
      </Button>
      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-muted-foreground">{state.success}</p>
      ) : null}
    </form>
  );
}
