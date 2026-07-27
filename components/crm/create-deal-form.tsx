"use client";

import { useActionState } from "react";

import { createDeal, type CrmActionResult } from "@/lib/crm/actions";
import type { CrmContact, CrmPipelineStage } from "@/lib/types/crm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fieldSelectClass } from "@/lib/ui/field";

const initial: CrmActionResult = {};

export function CreateDealForm({
  brandId,
  contacts,
  stages,
}: {
  brandId: string;
  contacts: Array<Pick<CrmContact, "id" | "email" | "name">>;
  stages: CrmPipelineStage[];
}) {
  const [state, action, pending] = useActionState(createDeal, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">New deal</p>
      <input type="hidden" name="brandId" value={brandId} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Contact</Label>
          <select
            name="contactId"
            className={fieldSelectClass}
            required
            defaultValue={contacts[0]?.id ?? ""}
          >
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input name="name" required />
        </div>
        <div className="space-y-2">
          <Label>Value (£)</Label>
          <Input name="value" type="number" step="0.01" defaultValue={0} />
        </div>
        <div className="space-y-2">
          <Label>Stage</Label>
          <select
            name="stage"
            className={fieldSelectClass}
            defaultValue={stages[0]?.id ?? "discovery"}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Input name="expectedClose" type="date" />
      {state.error || state.success ? (
        <Alert variant={state.error ? "destructive" : "default"}>
          <AlertDescription>{state.error || state.success}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending || !contacts.length}>
        {pending ? "Creating…" : "Create deal"}
      </Button>
    </form>
  );
}
