"use client";

import { useActionState } from "react";

import {
  deleteBrandKpi,
  upsertBrandKpi,
  type ReviewsActionResult,
} from "@/lib/reviews/actions";
import {
  SUGGESTED_KPI_KEYS,
  type BrandKpi,
} from "@/lib/types/reviews";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: ReviewsActionResult = {};

export function KpiConfigForm({
  brandId,
  brandName,
  kpis,
}: {
  brandId: string;
  brandName: string;
  kpis: BrandKpi[];
}) {
  const [state, action, pending] = useActionState(upsertBrandKpi, initial);

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <p className="text-sm font-medium">{brandName} — north-star KPIs</p>

      <ul className="divide-y rounded-lg border">
        {kpis.length === 0 ? (
          <li className="p-3 text-sm text-muted-foreground">
            No KPIs yet. Add targets so report commentary measures against them.
          </li>
        ) : (
          kpis.map((kpi) => (
            <li
              key={kpi.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {kpi.is_north_star ? "★ " : ""}
                  {kpi.label}{" "}
                  <span className="text-muted-foreground">({kpi.metric_key})</span>
                </p>
                <p className="text-muted-foreground">
                  Target {kpi.target_value}
                  {kpi.unit ? ` ${kpi.unit}` : ""}
                  {kpi.channel ? ` · ${kpi.channel}` : ""}
                </p>
              </div>
              <form action={deleteBrandKpi}>
                <input type="hidden" name="kpiId" value={kpi.id} />
                <Button type="submit" size="xs" variant="outline">
                  Remove
                </Button>
              </form>
            </li>
          ))
        )}
      </ul>

      <form action={action} className="space-y-3 border-t pt-4">
        <input type="hidden" name="brandId" value={brandId} />
        <p className="text-sm font-medium">Add / update KPI</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Metric key</Label>
            <Input
              name="metricKey"
              list={`kpi-keys-${brandId}`}
              placeholder="roas"
              required
            />
            <datalist id={`kpi-keys-${brandId}`}>
              {SUGGESTED_KPI_KEYS.map((k) => (
                <option key={k.metric_key} value={k.metric_key}>
                  {k.label}
                </option>
              ))}
            </datalist>
          </div>
          <div className="space-y-2">
            <Label>Label</Label>
            <Input name="label" placeholder="ROAS" required />
          </div>
          <div className="space-y-2">
            <Label>Target</Label>
            <Input name="targetValue" type="number" step="any" defaultValue={0} required />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Input name="unit" placeholder="£ or x" />
          </div>
          <div className="space-y-2">
            <Label>Channel</Label>
            <Input name="channel" placeholder="ads / email / seo…" />
          </div>
          <div className="space-y-2">
            <Label>Sort order</Label>
            <Input name="sortOrder" type="number" defaultValue={0} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isNorthStar" />
          Mark as north-star
        </label>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error || state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save KPI"}
        </Button>
      </form>
    </div>
  );
}
