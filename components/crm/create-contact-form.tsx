"use client";

import { useActionState } from "react";

import {
  createContact,
  syncEmailSubscribersToCrm,
  type CrmActionResult,
} from "@/lib/crm/actions";
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_STAGES,
} from "@/lib/types/crm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: CrmActionResult = {};

export function CreateContactForm({
  brands,
}: {
  brands: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createContact, initial);
  const [syncState, syncAction, syncPending] = useActionState(
    syncEmailSubscribersToCrm,
    initial,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form action={action} className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Add contact</p>
        <div className="space-y-2">
          <Label>Brand</Label>
          <select
            name="brandId"
            className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
            defaultValue={brands[0]?.id ?? ""}
            required
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input name="name" />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input name="phone" />
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <Input name="company" />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Lifecycle</Label>
            <select
              name="lifecycleStage"
              className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
              defaultValue="lead"
            >
              {LIFECYCLE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {LIFECYCLE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input name="tags" placeholder="warm, webinar" />
          </div>
        </div>
        <Input name="source" type="hidden" value="manual" />
        {state.error || state.success ? (
          <Alert variant={state.error ? "destructive" : "default"}>
            <AlertDescription>{state.error || state.success}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={pending || !brands.length}>
          {pending ? "Saving…" : "Save contact"}
        </Button>
      </form>

      <form action={syncAction} className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Sync email subscribers</p>
        <p className="text-xs text-muted-foreground">
          Upserts CRM contacts from subscribed email list members for a brand.
        </p>
        <select
          name="brandId"
          className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
          defaultValue={brands[0]?.id ?? ""}
          required
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {syncState.error || syncState.success ? (
          <Alert variant={syncState.error ? "destructive" : "default"}>
            <AlertDescription>
              {syncState.error || syncState.success}
            </AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" variant="outline" disabled={syncPending || !brands.length}>
          {syncPending ? "Syncing…" : "Sync now"}
        </Button>
      </form>
    </div>
  );
}
