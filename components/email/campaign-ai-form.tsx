"use client";

import { useActionState } from "react";

import {
  generateCampaignWithAi,
  type EmailActionResult,
} from "@/lib/email/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initial: EmailActionResult = {};

export function CampaignAiForm() {
  const [state, action, pending] = useActionState(generateCampaignWithAi, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div className="space-y-2">
        <Label htmlFor="brief">AI campaign brief</Label>
        <Textarea
          id="brief"
          name="brief"
          rows={3}
          placeholder="e.g. Announce our spring sale to existing customers — 20% off, brand voice warm and confident"
          required
        />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate campaign with AI"}
      </Button>
    </form>
  );
}
