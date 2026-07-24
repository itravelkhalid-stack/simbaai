"use client";

import { useActionState } from "react";

import {
  selectLinkedInOrg,
  type LinkedInSelectResult,
} from "@/lib/social/linkedin-actions";
import type { LinkedInOrgOption } from "@/lib/social/linkedin-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: LinkedInSelectResult = {};

export function LinkedInOrgPicker({
  sessionId,
  orgs,
}: {
  sessionId: string;
  orgs: LinkedInOrgOption[];
}) {
  const [state, action, pending] = useActionState(selectLinkedInOrg, initial);

  return (
    <div className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {orgs.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            No company Pages were returned for this LinkedIn account.
          </AlertDescription>
        </Alert>
      ) : null}

      <ul className="space-y-3">
        {orgs.map((org) => (
          <li
            key={org.org_id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
          >
            <div className="space-y-1">
              <p className="font-medium">{org.org_name}</p>
              <p className="text-sm text-muted-foreground">
                Page ID {org.org_id}
              </p>
            </div>
            <form action={action}>
              <input type="hidden" name="sessionId" value={sessionId} />
              <input type="hidden" name="orgId" value={org.org_id} />
              <Button type="submit" disabled={pending} size="sm">
                {pending ? "Saving…" : "Use this Page"}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
