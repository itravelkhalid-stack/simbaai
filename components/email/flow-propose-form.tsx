"use client";

import { useActionState } from "react";

import {
  proposeWelcomeFlow,
  type EmailActionResult,
} from "@/lib/email/actions";
import type { EmailList } from "@/lib/types/email";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: EmailActionResult = {};

export function FlowProposeForm({ lists }: { lists: EmailList[] }) {
  const [state, action, pending] = useActionState(proposeWelcomeFlow, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div className="space-y-2">
        <Label htmlFor="brief">Flow brief</Label>
        <Textarea
          id="brief"
          name="brief"
          rows={3}
          placeholder='e.g. Create a 5-email welcome sequence for new newsletter signups'
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="emailCount">Emails in sequence</Label>
          <Input
            id="emailCount"
            name="emailCount"
            type="number"
            min={2}
            max={10}
            defaultValue={5}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="listId">Attach list (optional)</Label>
          <select
            id="listId"
            name="listId"
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            defaultValue=""
          >
            <option value="">None</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Proposing…" : "Propose sequence strategy"}
      </Button>
    </form>
  );
}
