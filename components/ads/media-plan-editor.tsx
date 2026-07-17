"use client";

import { useActionState, useState } from "react";

import {
  approveMediaPlan,
  updateMediaPlanJson,
  type AdsActionResult,
} from "@/lib/ads/actions";
import type { AdMediaPlan, MediaPlanPayload } from "@/lib/types/ads";
import { formatPence } from "@/lib/ads/format";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: AdsActionResult = {};

export function MediaPlanEditor({ plan }: { plan: AdMediaPlan }) {
  const [name, setName] = useState(plan.name);
  const [json, setJson] = useState(JSON.stringify(plan.plan, null, 2));
  const [state, action, pending] = useActionState(updateMediaPlanJson, initial);
  const payload = plan.plan as MediaPlanPayload;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium">Summary</p>
        <p className="mt-2 text-sm text-muted-foreground">{payload.summary}</p>
        <p className="mt-3 text-sm">
          Budget {formatPence(plan.monthly_budget_pence, plan.currency)} · Status{" "}
          {plan.status}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <p className="mb-2 text-sm font-medium">Platform split</p>
          <ul className="space-y-2 text-sm">
            {(payload.platform_split ?? []).map((row) => (
              <li key={row.platform}>
                <span className="font-medium">{row.platform}</span> · {row.budget_pct}% —{" "}
                {row.rationale}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border p-4">
          <p className="mb-2 text-sm font-medium">Funnel</p>
          <ul className="space-y-2 text-sm">
            {(payload.funnel_stages ?? []).map((row) => (
              <li key={row.stage}>
                <span className="font-medium">{row.stage}</span> · {row.budget_pct}% —{" "}
                {row.goal}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <p className="mb-2 text-sm font-medium">Proposed campaigns</p>
        <ul className="space-y-3 text-sm">
          {(payload.campaigns ?? []).map((c) => (
            <li key={`${c.platform}-${c.name}`} className="rounded-lg border p-3">
              <p className="font-medium">
                {c.name} · {c.platform}
              </p>
              <p className="text-muted-foreground">
                {c.funnel_stage} · {formatPence(c.daily_budget_pence, plan.currency)}
                /day · {c.audience}
              </p>
              <p className="mt-1">{c.targeting_notes}</p>
            </li>
          ))}
        </ul>
      </div>

      {plan.status !== "approved" ? (
        <>
          <form action={action} className="space-y-3 rounded-xl border p-4">
            <input type="hidden" name="planId" value={plan.id} />
            <div className="space-y-2">
              <Label htmlFor="name">Plan name</Label>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="planJson">Editable plan JSON</Label>
              <Textarea
                id="planJson"
                name="planJson"
                rows={16}
                value={json}
                onChange={(e) => setJson(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            {state.error || state.success ? (
              <Alert variant={state.error ? "destructive" : "default"}>
                <AlertDescription>{state.error || state.success}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={pending} variant="outline">
              {pending ? "Saving…" : "Save edits"}
            </Button>
          </form>

          <form action={approveMediaPlan}>
            <input type="hidden" name="planId" value={plan.id} />
            <Button type="submit">Approve plan & create campaigns</Button>
          </form>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Plan approved — campaigns were created under Campaigns.
        </p>
      )}
    </div>
  );
}
