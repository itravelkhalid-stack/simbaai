"use client";

import { useActionState } from "react";

import {
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMemberRole,
  type OrgActionResult,
} from "@/lib/org/actions";
import { INVITE_ROLES } from "@/lib/constants";
import type { Invitation, OrgMemberRole, Profile } from "@/lib/types/database";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteMember,
    initial,
  );
  const [roleState, roleAction] = useActionState(updateMemberRole, initial);
  const [removeState, removeAction] = useActionState(removeMember, initial);
  const [revokeState, revokeAction] = useActionState(revokeInvitation, initial);

  const feedback =
    inviteState.error ||
    inviteState.success ||
    roleState.error ||
    roleState.success ||
    removeState.error ||
    removeState.success ||
    revokeState.error ||
    revokeState.success;

  const feedbackIsError = Boolean(
    inviteState.error ||
      roleState.error ||
      removeState.error ||
      revokeState.error,
  );

  return (
    <div className="space-y-8">
      {feedback ? (
        <Alert variant={feedbackIsError ? "destructive" : "default"}>
          <AlertDescription>{feedback}</AlertDescription>
        </Alert>
      ) : null}

      {canManage ? (
        <form action={inviteAction} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_180px_auto]">
          <div className="space-y-2">
            <Label htmlFor="email">Invite by email</Label>
            <Input id="email" name="email" type="email" required placeholder="teammate@brand.com" />
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
            <Button type="submit" disabled={invitePending}>
              {invitePending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </form>
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
                {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
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
                        {member.user_id === currentUserId ? "You" : member.user_id.slice(0, 8)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage && member.user_id !== currentUserId ? (
                      <form action={roleAction} className="flex items-center gap-2">
                        <input type="hidden" name="memberId" value={member.id} />
                        <select
                          name="role"
                          defaultValue={member.role}
                          className={fieldSelectClass}
                          onChange={(event) => event.currentTarget.form?.requestSubmit()}
                        >
                          <option value="org_owner">owner</option>
                          <option value="org_admin">admin</option>
                          <option value="org_member">member</option>
                          <option value="org_viewer">viewer</option>
                        </select>
                      </form>
                    ) : (
                      <Badge variant="secondary">{member.role.replace("org_", "")}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{member.status}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {member.user_id !== currentUserId && member.role !== "org_owner" ? (
                        <form action={removeAction}>
                          <input type="hidden" name="memberId" value={member.id} />
                          <Button type="submit" variant="destructive" size="sm">
                            Remove
                          </Button>
                        </form>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {canManage ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Pending invitations</h2>
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
                        <form action={revokeAction}>
                          <input type="hidden" name="invitationId" value={invite.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Revoke
                          </Button>
                        </form>
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
