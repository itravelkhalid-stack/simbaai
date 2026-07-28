"use client";

import { useActionState } from "react";

import {
  joinPendingInvitation,
  type OrgActionResult,
} from "@/lib/org/actions";
import type { PendingInviteForUser } from "@/lib/org/pending-invites";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

const initial: OrgActionResult = {};

export function PendingInvitesJoin({
  invites,
}: {
  invites: PendingInviteForUser[];
}) {
  const [state, action, pending] = useActionState(joinPendingInvitation, initial);

  if (invites.length === 0) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">You have pending invitations</h2>
        <p className="text-sm text-muted-foreground">
          Join an organization you were invited to, or create a new one below.
        </p>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <ul className="space-y-3">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
          >
            <div>
              <p className="font-medium">{invite.organization_name}</p>
              <p className="text-xs text-muted-foreground">
                Role: {invite.role.replace("org_", "")} · Expires{" "}
                {new Date(invite.expires_at).toLocaleDateString()}
              </p>
            </div>
            <form action={action}>
              <input type="hidden" name="invitationId" value={invite.id} />
              <Button type="submit" disabled={pending}>
                {pending ? "Joining…" : `Join ${invite.organization_name}`}
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
