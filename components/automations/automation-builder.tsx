"use client";

import { useActionState } from "react";

import {
  saveAutomation,
  testRunAutomation,
  type AutomationsActionResult,
} from "@/lib/automations/actions";
import type {
  Automation,
  AutomationRun,
} from "@/lib/types/automations";
import {
  ACTION_TYPE_LABELS,
  AUTOMATION_STATUS_LABELS,
  TRIGGER_TYPE_LABELS,
} from "@/lib/types/automations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fieldCheckboxClass, fieldSelectClass } from "@/lib/ui/field";

const initial: AutomationsActionResult = {};

export function AutomationBuilder({
  automation,
  runs,
  webhookUrl,
}: {
  automation: Automation;
  runs: AutomationRun[];
  webhookUrl: string;
}) {
  const [saveState, saveAction, savePending] = useActionState(
    saveAutomation,
    initial,
  );
  const [testState, testAction, testPending] = useActionState(
    testRunAutomation,
    initial,
  );

  const trigger = automation.trigger;
  const steps = [
    {
      label: "Trigger",
      detail: `${TRIGGER_TYPE_LABELS[trigger.type]} · ${JSON.stringify(trigger)}`,
    },
    {
      label: "Conditions",
      detail: (automation.conditions ?? []).length
        ? `${automation.conditions.length} group(s)`
        : "None (always run)",
    },
    ...((automation.actions ?? []).map((a, i) => ({
      label: `Action ${i + 1}`,
      detail: `${ACTION_TYPE_LABELS[a.type]} · ${JSON.stringify(a)}`,
    })) as Array<{ label: string; detail: string }>),
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Flow</p>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="relative rounded-lg border bg-muted/20 p-3">
              {i < steps.length - 1 ? (
                <span className="absolute left-6 top-full h-3 w-px bg-border" />
              ) : null}
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {step.label}
              </p>
              <p className="mt-1 break-all font-mono text-xs">{step.detail}</p>
            </li>
          ))}
        </ol>
      </div>

      <form action={saveAction} className="space-y-4 rounded-xl border p-4">
        <input type="hidden" name="id" value={automation.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={automation.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <select
              id="status"
              name="status"
              defaultValue={automation.status}
              className={fieldSelectClass}
            >
              {Object.entries(AUTOMATION_STATUS_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={2}
            defaultValue={automation.description ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="trigger_json">Trigger (JSON)</Label>
          <Textarea
            id="trigger_json"
            name="trigger_json"
            rows={6}
            className="font-mono text-xs"
            defaultValue={JSON.stringify(automation.trigger, null, 2)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="conditions_json">Condition groups (JSON)</Label>
          <Textarea
            id="conditions_json"
            name="conditions_json"
            rows={6}
            className="font-mono text-xs"
            defaultValue={JSON.stringify(automation.conditions ?? [], null, 2)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="actions_json">Actions ordered (JSON)</Label>
          <Textarea
            id="actions_json"
            name="actions_json"
            rows={10}
            className="font-mono text-xs"
            defaultValue={JSON.stringify(automation.actions ?? [], null, 2)}
          />
        </div>
        {trigger.type === "webhook" ? (
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Webhook URL</p>
            <p className="mt-1 break-all font-mono text-xs">{webhookUrl}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Header <code>x-automation-secret</code> or{" "}
              <code>?secret=</code>
              {automation.webhook_secret}
            </p>
          </div>
        ) : null}
        {saveState.error || saveState.success ? (
          <Alert variant={saveState.error ? "destructive" : "default"}>
            <AlertDescription>
              {saveState.error || saveState.success}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={savePending}>
          {savePending ? "Saving…" : "Save automation"}
        </Button>
      </form>

      <form action={testAction} className="space-y-3 rounded-xl border p-4">
        <input type="hidden" name="id" value={automation.id} />
        <p className="text-sm font-medium">Test run</p>
        <Textarea
          name="sample_json"
          rows={4}
          className="font-mono text-xs"
          defaultValue={JSON.stringify(
            {
              contact_id: "sample-contact-id",
              campaign_id: "sample-campaign-id",
              tag: "lead",
            },
            null,
            2,
          )}
        />
        <label className="flex items-center gap-2 text-sm">
          <input className={fieldCheckboxClass} type="checkbox" name="dryRun" defaultChecked />
          Dry-run (skip side effects)
        </label>
        {testState.error || testState.success ? (
          <Alert variant={testState.error ? "destructive" : "default"}>
            <AlertDescription>
              {testState.error || testState.success}
              {testState.runId ? ` · run ${testState.runId}` : ""}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" variant="secondary" disabled={testPending}>
          {testPending ? "Running…" : "Test run"}
        </Button>
      </form>

      <section className="rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-medium">Run history</h2>
        <ul className="divide-y text-sm">
          {runs.length === 0 ? (
            <li className="py-2 text-muted-foreground">No runs yet.</li>
          ) : (
            runs.map((run) => (
              <li key={run.id} className="space-y-1 py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{run.status}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(run.started_at).toLocaleString()}
                  </span>
                </div>
                {run.error ? (
                  <p className="text-xs text-destructive">{run.error}</p>
                ) : null}
                <details className="text-xs text-muted-foreground">
                  <summary>Actions executed</summary>
                  <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2">
                    {JSON.stringify(run.actions_executed, null, 2)}
                  </pre>
                </details>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
