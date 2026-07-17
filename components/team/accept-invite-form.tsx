"use client";

import { useActionState } from "react";
import Link from "next/link";

import { acceptInvitation, type OrgActionResult } from "@/lib/org/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initial: OrgActionResult = {};

export function AcceptInviteForm({
  token,
  signedIn,
}: {
  token: string;
  signedIn: boolean;
}) {
  const [state, formAction, pending] = useActionState(acceptInvitation, initial);

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Missing invitation token.</AlertDescription>
      </Alert>
    );
  }

  if (!signedIn) {
    const next = `/accept-invite?token=${encodeURIComponent(token)}`;
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sign in or create an account with the invited email to join this organization.
        </p>
        <div className="flex gap-3">
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className={cn(buttonVariants())}
          >
            Sign in
          </Link>
          <Link
            href={`/signup?next=${encodeURIComponent(next)}`}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Create account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}
