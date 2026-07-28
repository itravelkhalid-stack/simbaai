"use client";

import { useActionState } from "react";
import Link from "next/link";

import { acceptInvitation, type OrgActionResult } from "@/lib/org/actions";
import type { InvitePreview } from "@/lib/org/invite-preview";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const initial: OrgActionResult = {};

export function AcceptInviteForm({
  token,
  signedIn,
  userEmail,
  preview,
  initialError,
}: {
  token: string;
  signedIn: boolean;
  userEmail: string | null;
  preview: InvitePreview | null;
  initialError: string | null;
}) {
  const [state, formAction, pending] = useActionState(acceptInvitation, initial);
  const error = state.error || initialError;

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error || "Missing invitation token. Open the link from your invite email."}
        </AlertDescription>
      </Alert>
    );
  }

  if (!preview) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error ||
            "This invitation link is invalid or has been removed. Ask your admin for a new invite."}
        </AlertDescription>
      </Alert>
    );
  }

  if (preview.expired || preview.status === "expired") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This invitation to {preview.organizationName} has expired. Ask your admin
          to send a new one.
        </AlertDescription>
      </Alert>
    );
  }

  if (preview.status === "revoked") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This invitation to {preview.organizationName} was revoked.
        </AlertDescription>
      </Alert>
    );
  }

  if (preview.status === "accepted") {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertDescription>
            This invitation was already accepted. Sign in to open your workspace.
          </AlertDescription>
        </Alert>
        <Link href="/login" className={cn(buttonVariants())}>
          Sign in
        </Link>
      </div>
    );
  }

  if (preview.status !== "pending") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This invitation is no longer valid ({preview.status}).
        </AlertDescription>
      </Alert>
    );
  }

  if (!signedIn) {
    const next = `/accept-invite?token=${encodeURIComponent(token)}`;
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Sign in or create an account with{" "}
          <span className="font-medium text-foreground">{preview.email}</span> to
          join {preview.organizationName}.
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

  if (
    userEmail &&
    preview.email.toLowerCase() !== userEmail.toLowerCase()
  ) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This invitation was sent to {preview.email}, but you are signed in as{" "}
          {userEmail}. Sign out and use the invited email, or ask for a new invite.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">
        You&apos;re about to join {preview.organizationName} as{" "}
        {preview.role.replace("org_", "")}.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}
