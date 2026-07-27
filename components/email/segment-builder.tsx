"use client";
import { fieldSelectClass } from "@/lib/ui/field";

import { useActionState, useState } from "react";

import { createSegment, type EmailActionResult } from "@/lib/email/actions";
import type { SegmentRule, SegmentRuleGroup } from "@/lib/types/email";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: EmailActionResult = {};

function newRule(): SegmentRule {
  return {
    id: globalThis.crypto.randomUUID(),
    field: "status",
    operator: "eq",
    value: "subscribed",
  };
}

export function SegmentBuilder() {
  const [combinator, setCombinator] = useState<"and" | "or">("and");
  const [rules, setRules] = useState<SegmentRule[]>([newRule()]);
  const [state, action, pending] = useActionState(createSegment, initial);

  const group: SegmentRuleGroup = { combinator, rules };

  return (
    <form action={action} className="space-y-4 rounded-xl border p-4">
      <input type="hidden" name="rules" value={JSON.stringify(group)} />
      <div className="space-y-2">
        <Label htmlFor="name">Segment name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" />
      </div>
      <div className="space-y-2">
        <Label>Match</Label>
        <select
          value={combinator}
          onChange={(e) => setCombinator(e.target.value as "and" | "or")}
          className={fieldSelectClass}
        >
          <option value="and">ALL rules (AND)</option>
          <option value="or">ANY rule (OR)</option>
        </select>
      </div>

      <div className="space-y-3">
        {rules.map((rule) => (
          <div key={rule.id} className="grid gap-2 md:grid-cols-4">
            <select
              className={fieldSelectClass}
              value={rule.field}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((r) =>
                    r.id === rule.id ? { ...r, field: e.target.value } : r,
                  ),
                )
              }
            >
              <option value="email">email</option>
              <option value="first_name">first_name</option>
              <option value="last_name">last_name</option>
              <option value="status">status</option>
              <option value="source">source</option>
              <option value="tag">tag</option>
              <option value="custom.city">custom.city</option>
            </select>
            <select
              className={fieldSelectClass}
              value={rule.operator}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((r) =>
                    r.id === rule.id
                      ? { ...r, operator: e.target.value as SegmentRule["operator"] }
                      : r,
                  ),
                )
              }
            >
              <option value="eq">equals</option>
              <option value="neq">not equals</option>
              <option value="contains">contains</option>
              <option value="in">in</option>
              <option value="not_in">not in</option>
              <option value="is_set">is set</option>
              <option value="is_empty">is empty</option>
            </select>
            <Input
              value={rule.value}
              onChange={(e) =>
                setRules((prev) =>
                  prev.map((r) =>
                    r.id === rule.id ? { ...r, value: e.target.value } : r,
                  ),
                )
              }
              placeholder="value"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setRules((prev) => prev.filter((r) => r.id !== rule.id))}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <Button type="button" variant="outline" onClick={() => setRules((prev) => [...prev, newRule()])}>
        Add rule
      </Button>

      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending || rules.length === 0}>
        {pending ? "Saving…" : "Save segment"}
      </Button>
    </form>
  );
}
