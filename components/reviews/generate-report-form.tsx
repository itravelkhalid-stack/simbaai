"use client";

import { useActionState } from "react";

import {
  generateReportNow,
  type ReviewsActionResult,
} from "@/lib/reviews/actions";
import { REPORT_TYPE_LABELS, type ReportType } from "@/lib/types/reviews";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const initial: ReviewsActionResult = {};
const TYPES: ReportType[] = ["daily", "weekly", "monthly", "quarterly"];

export function GenerateReportForm({
  brands,
}: {
  brands: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(generateReportNow, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">Generate report now</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="brandId">Brand</Label>
          <select
            id="brandId"
            name="brandId"
            className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
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
          <Label htmlFor="type">Cadence</Label>
          <select
            id="type"
            name="type"
            className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            defaultValue="weekly"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {REPORT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending || !brands.length}>
        {pending ? "Queuing…" : "Queue report"}
      </Button>
    </form>
  );
}
