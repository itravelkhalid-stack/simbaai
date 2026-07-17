"use client";

import { useActionState } from "react";

import { createEmailList, type EmailActionResult } from "@/lib/email/actions";
import type { EmailList } from "@/lib/types/email";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

const initial: EmailActionResult = {};

export function ListsManager({ lists }: { lists: EmailList[] }) {
  const [state, action, pending] = useActionState(createEmailList, initial);

  return (
    <div className="space-y-6">
      <ul className="divide-y rounded-xl border">
        {lists.length === 0 ? (
          <li className="p-4 text-sm text-muted-foreground">No lists yet.</li>
        ) : (
          lists.map((list) => (
            <li key={list.id} className="flex items-center justify-between p-4">
              <div>
                <Link href={`/email/lists/${list.id}`} className="font-medium underline">
                  {list.name}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {list.description || "No description"}
                </p>
              </div>
            </li>
          ))
        )}
      </ul>

      <form action={action} className="space-y-3 rounded-xl border p-4">
        <div className="space-y-2">
          <Label htmlFor="name">List name</Label>
          <Input id="name" name="name" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input id="description" name="description" />
        </div>
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error || state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create list"}
        </Button>
      </form>
    </div>
  );
}
