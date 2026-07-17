"use client";

import { useActionState } from "react";

import { createSeoProject, type SeoActionResult } from "@/lib/seo/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: SeoActionResult = {};

export function CreateProjectForm() {
  const [state, action, pending] = useActionState(createSeoProject, initial);

  return (
    <form action={action} className="space-y-3 rounded-xl border p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="domain">Domain</Label>
          <Input id="domain" name="domain" placeholder="example.com" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Project name</Label>
          <Input id="name" name="name" placeholder="Optional" />
        </div>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create SEO project"}
      </Button>
    </form>
  );
}
