"use client";

import { useActionState, useState } from "react";

import {
  createTeamUser,
  inviteMember,
  removeMember,
  resendInvitation,
  resetTeamMemberPassword,
  revokeInvitation,
  updateMemberRole,
  type OrgActionResult,
} from "@/lib/org/actions";
import { INVITE_ROLES } from "@/lib/constants";
import type { Invitation, OrgMemberRole, Profile } from "@/lib/types/database";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fieldSelectClass } from "@/lib/ui/field";

const initial: OrgActionResult = {};

export type TeamMemberRow = {
  id: string;
  user_id: string;
  role: OrgMemberRole;
  status: string;
  profile: Pick<Profile, "full_name" | "avatar_url"> | null;
  email?: string | null;
};

function OneTimePasswordBanner({
  email,
  password,
  message,
}: {
  email?: string;
  password: string;
  message?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Alert className="border-amber-500/50 bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-50">
      <AlertTitle>Temporary password — shown only once</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          {message ??
            "Save this password now and share it securely. It will not be shown again."}
        </p>
        {email ? (
          <p className="text-sm">
            Login email: <span className="font-medium">{email}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border bg-background px-3 py-2 text-sm font-semibold tracking-wide text-foreground">
            {password}
          </code>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(password);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function TeamManagement({
  members,
  invitations,
  canManage,
  currentUserId,
}: {
  members: TeamMemberRow[];
  invitations: Invitation[];
  canManage: boolean;
  currentUserId: string;
}) {
  const [createState, createAction, createPending] = useActionState(
    createTeamUser,
    initial,
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteMember,
    initial,
  );
  const [roleState, roleAction] = useActionState(updateMemberRole, initial);
  const [removeState, removeAction] = useActionState(removeMember, initial);
  const [revokeState, revokeAction] = useActionState(revokeInvitation, initial);
  const [resendState, resendAction, resendPending] = useActionState(
    resendInvitation,
    initial,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetTeamMemberPassword,
    initial,
  );

  const oneTimePassword =
    createState.temporaryPassword || resetState.temporaryPassword;
  const oneTimeEmail = createState.createdEmail || resetState.createdEmail;
  const oneTimeMessage = createState.temporaryPassword
    ? createState.success
    : resetState.temporaryPassword
      ? resetState.success
      : undefined;

  const feedback =
    createState.error ||
    (!createState.temporaryPassword && createState.success) ||
    inviteState.error ||
    inviteState.success ||
    roleState.error ||
    roleState.success ||
    removeState.error ||
    removeState.success ||
    revokeState.error ||
    revokeState.success ||
    resendState.error ||
    resendState.success ||
    resetState.error ||
    (!resetState.temporaryPassword && resetState.success);

  const feedbackIsError = Boolean(
    createState.error ||
      inviteState.error ||
      roleState.error ||
      removeState.error ||
      revokeState.error ||
      resendState.error ||
      resetState.error,
  );

  return (
    <div className="space-y-8">
      {oneTimePassword ? (
        <OneTimePasswordBanner
          email={oneTimeEmail}
          password={oneTimePassword}
          message={oneTimeMessage}
        />
      ) : null}

      {feedback ? (
        <Alert variant={feedbackIsError ? "destructive" : "default"}>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{feedback}</span>
            {createState.upgradeHref || inviteState.upgradeHref ? (
              <a
                href={createState.upgradeHref || inviteState.upgradeHref}
                className="font-medium underline"
              >
                View plans & upgrade
              </a>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {canManage ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Create user account</h2>
            <p className="text-sm text-muted-foreground">
              Creates a confirmed login for this organization. No invite email —
              you get a temporary password to share once.
            </p>
          </div>
          <form
            action={createAction}
            className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1fr_180px_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input
                id="fullName"
                name="fullName"
                required
                placeholder="Jordan Lee"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="createEmail">Email (login)</Label>
              <Input
                id="createEmail"
                name="email"
                type="email"
                required
                placeholder="teammate@brand.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="createRole">Role</Label>
              <select
                id="createRole"
                name="role"
                defaultValue="org_member"
                className={fieldSelectClass}
              >
                {INVITE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.replace("org_", "")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={createPending}>
                {createPending ? "Creating…" : "Create user account"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Members</h2>
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">
                        {member.profile?.full_name ?? "Unnamed user"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.email
                          ? member.email
                          : member.user_id === currentUserId
                            ? "You"
                            : member.user_id.slice(0, 8)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage && member.user_id !== currentUserId ? (
                      <form
                        action={roleAction}
                        className="flex items-center gap-2"
                      >
                        <input type="hidden" name="memberId" value={member.id} />
                        <select
                          name="role"
                          defaultValue={member.role}
                          className={fieldSelectClass}
                          onChange={(event) =>
                            event.currentTarget.form?.requestSubmit()
                          }
                        >
                          <option value="org_owner">owner</option>
                          <option value="org_admin">admin</option>
                          <option value="org_member">member</option>
                          <option value="org_viewer">viewer</option>
                        </select>
                      </form>
                    ) : (
                      <Badge variant="secondary">
                        {member.role.replace("org_", "")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{member.status}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {member.user_id !== currentUserId ? (
                          <form action={resetAction}>
                            <input
                              type="hidden"
                              name="memberId"
                              value={member.id}
                            />
                            <Button
                              type="submit"
                              variant="secondary"
                              size="sm"
                              disabled={resetPending}
                            >
                              Reset password
                            </Button>
                          </form>
                        ) : null}
                        {member.user_id !== currentUserId &&
                        member.role !== "org_owner" ? (
                          <form action={removeAction}>
                            <input
                              type="hidden"
                              name="memberId"
                              value={member.id}
                            />
                            <Button
                              type="submit"
                              variant="destructive"
                              size="sm"
                            >
                              Remove
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {canManage ? (
        <section className="space-y-3 border-t pt-8">
          <div>
            <h2 className="text-lg font-semibold">Invite by email</h2>
            <p className="text-sm text-muted-foreground">
              Secondary path — sends an invitation link. Prefer Create user
              account when you want an immediate login with no email.
            </p>
          </div>
          <form
            action={inviteAction}
            className="grid gap-3 rounded-xl border border-dashed p-4 md:grid-cols-[1fr_180px_auto]"
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="teammate@brand.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                name="role"
                defaultValue="org_member"
                className={fieldSelectClass}
              >
                {INVITE_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role.replace("org_", "")}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" variant="outline" disabled={invitePending}>
                {invitePending ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </form>

          <h3 className="pt-2 text-sm font-medium text-muted-foreground">
            Pending invitations
          </h3>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      No pending invitations
                    </TableCell>
                  </TableRow>
                ) : (
                  invitations.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>{invite.role.replace("org_", "")}</TableCell>
                      <TableCell>
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <form action={resendAction}>
                            <input
                              type="hidden"
                              name="invitationId"
                              value={invite.id}
                            />
                            <Button
                              type="submit"
                              variant="secondary"
                              size="sm"
                              disabled={resendPending}
                            >
                              {resendPending ? "Sending…" : "Resend invitation"}
                            </Button>
                          </form>
                          <form action={revokeAction}>
                            <input
                              type="hidden"
                              name="invitationId"
                              value={invite.id}
                            />
                            <Button type="submit" variant="outline" size="sm">
                              Revoke
                            </Button>
                          </form>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
