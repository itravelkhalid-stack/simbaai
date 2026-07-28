"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendInvitationEmail } from "@/lib/email/resend";
import { writeAuditEvent } from "@/lib/compliance/audit";
import {
  clearInviteTokenCookie,
  setInviteTokenCookie,
} from "@/lib/org/invite-cookie";
import {
  findAuthUserIdByEmail,
  generateTemporaryPassword,
} from "@/lib/org/passwords";
import {
  canManageTeam,
  resolveActiveOrganization,
  setActiveOrganizationId,
} from "@/lib/org/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { assertPlanAllows } from "@/lib/billing/plans";
import { actionErrorFromUnknown } from "@/lib/billing/action-error";
import {
  createOrganizationSchema,
  createTeamUserSchema,
  inviteMemberSchema,
  removeMemberSchema,
  resetTeamMemberPasswordSchema,
  switchOrgSchema,
  updateMemberRoleSchema,
} from "@/lib/validations/auth";

export type OrgActionResult = {
  error?: string;
  upgradeHref?: string;
  success?: string;
  /** Shown once in the UI after create/reset — never stored. */
  temporaryPassword?: string;
  createdEmail?: string;
};

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function friendlyInviteError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("expired")) {
    return "This invitation has expired. Ask your admin to send a new one.";
  }
  if (lower.includes("no longer pending") || lower.includes("revoked")) {
    return "This invitation is no longer valid (revoked or already used).";
  }
  if (lower.includes("not found")) {
    return "This invitation link is invalid or has been removed.";
  }
  if (lower.includes("does not match")) {
    return "Sign in with the email address this invitation was sent to.";
  }
  if (lower.includes("not authenticated")) {
    return "You must be signed in to accept this invitation.";
  }
  return message;
}

export async function createOrganization(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) {
    return { error: error.message };
  }

  const org = Array.isArray(data) ? data[0] : data;
  if (!org?.id) {
    return { error: "Organization was not created" };
  }

  await setActiveOrganizationId(org.id);
  redirect("/");
}

export async function switchOrganization(formData: FormData) {
  const parsed = switchOrgSchema.safeParse({
    organizationId: formData.get("organizationId"),
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid organization");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in");
  }

  const { memberships } = await resolveActiveOrganization(user.id);
  const allowed = memberships.some(
    (m) => m.organization_id === parsed.data.organizationId,
  );

  if (!allowed) {
    throw new Error("You are not a member of that organization");
  }

  await setActiveOrganizationId(parsed.data.organizationId);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function inviteMember(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = inviteMemberSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (!active || !canManageTeam(active.role)) {
    return { error: "Only owners and admins can invite members" };
  }

  try {
    await assertPlanAllows(active.organization_id, "team_members");
  } catch (error) {
    return actionErrorFromUnknown(error, "Plan limit reached");
  }

  const email = parsed.data.email.toLowerCase();

  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      organization_id: active.organization_id,
      email,
      role: parsed.data.role,
      invited_by: user.id,
    })
    .select("*")
    .single();

  if (error) {
    return { error: error.message };
  }

  const inviteUrl = `${siteUrl()}/accept-invite?token=${invitation.token}`;

  try {
    const sent = await sendInvitationEmail({
      to: email,
      organizationName: active.organization.name,
      inviteUrl,
      role: parsed.data.role,
    });
    revalidatePath("/settings/team");
    return {
      success: `Invitation sent to ${email} (from ${sent.from})`,
    };
  } catch (err) {
    revalidatePath("/settings/team");
    return {
      error:
        err instanceof Error
          ? `Invite saved but email failed: ${err.message}. Use Resend invitation once email is fixed.`
          : "Invite saved but email failed. Use Resend invitation once email is fixed.",
    };
  }
}

export async function resendInvitation(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) {
    return { error: "Missing invitation" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (!active || !canManageTeam(active.role)) {
    return { error: "Only owners and admins can resend invitations" };
  }

  const { data: invitation, error } = await supabase
    .from("invitations")
    .select("*")
    .eq("id", invitationId)
    .eq("organization_id", active.organization_id)
    .single();

  if (error || !invitation) {
    return { error: "Invitation not found" };
  }

  if (invitation.status !== "pending") {
    return { error: "Only pending invitations can be resent" };
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return { error: "This invitation has expired. Send a new invite instead." };
  }

  const inviteUrl = `${siteUrl()}/accept-invite?token=${invitation.token}`;

  try {
    const sent = await sendInvitationEmail({
      to: invitation.email,
      organizationName: active.organization.name,
      inviteUrl,
      role: invitation.role,
    });
    revalidatePath("/settings/team");
    return {
      success: `Invitation resent to ${invitation.email} (from ${sent.from})`,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Resend failed: ${err.message}`
          : "Resend failed",
    };
  }
}

export async function updateMemberRole(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = updateMemberRoleSchema.safeParse({
    memberId: formData.get("memberId"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (!active || !canManageTeam(active.role)) {
    return { error: "Only owners and admins can change roles" };
  }

  const { data: member, error: memberError } = await supabase
    .from("organization_members")
    .select("*")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", active.organization_id)
    .single();

  if (memberError || !member) {
    return { error: "Member not found in this organization" };
  }

  if (member.role === "org_owner" && parsed.data.role !== "org_owner") {
    const { count } = await supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", active.organization_id)
      .eq("role", "org_owner")
      .eq("status", "active");

    if ((count ?? 0) <= 1) {
      return { error: "Organizations must keep at least one owner" };
    }
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.memberId)
    .eq("organization_id", active.organization_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/team");
  return { success: "Role updated" };
}

export async function removeMember(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = removeMemberSchema.safeParse({
    memberId: formData.get("memberId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (!active || !canManageTeam(active.role)) {
    return { error: "Only owners and admins can remove members" };
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("*")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", active.organization_id)
    .single();

  if (!member) {
    return { error: "Member not found" };
  }

  if (member.user_id === user.id) {
    return { error: "You cannot remove yourself" };
  }

  if (member.role === "org_owner") {
    return { error: "Transfer ownership before removing an owner" };
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", parsed.data.memberId)
    .eq("organization_id", active.organization_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/team");
  return { success: "Member removed" };
}

export async function acceptInvitation(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    return { error: "Missing invitation token" };
  }

  await setInviteTokenCookie(token);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/accept-invite?token=${token}`)}`);
  }

  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error) {
    return { error: friendlyInviteError(error.message) };
  }

  const membership = Array.isArray(data) ? data[0] : data;
  if (membership?.organization_id) {
    await setActiveOrganizationId(membership.organization_id);
  }

  await clearInviteTokenCookie();
  revalidatePath("/", "layout");
  redirect("/");
}

/** Accept a pending invite matched by the signed-in user's email (no link token). */
export async function joinPendingInvitation(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) {
    return { error: "Missing invitation" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return { error: "You must be signed in" };
  }

  const { data: invitation, error: loadError } = await supabase
    .from("invitations")
    .select("id, token, email, status, expires_at")
    .eq("id", invitationId)
    .eq("status", "pending")
    .single();

  if (loadError || !invitation) {
    return {
      error: friendlyInviteError(
        loadError?.message ?? "Invitation not found",
      ),
    };
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return {
      error: "Sign in with the email address this invitation was sent to.",
    };
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return {
      error: "This invitation has expired. Ask your admin to send a new one.",
    };
  }

  const { data, error } = await supabase.rpc("accept_invitation", {
    p_token: invitation.token,
  });

  if (error) {
    return { error: friendlyInviteError(error.message) };
  }

  const membership = Array.isArray(data) ? data[0] : data;
  if (membership?.organization_id) {
    await setActiveOrganizationId(membership.organization_id);
  }

  await clearInviteTokenCookie();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function revokeInvitation(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const invitationId = String(formData.get("invitationId") ?? "");
  if (!invitationId) {
    return { error: "Missing invitation" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (!active || !canManageTeam(active.role)) {
    return { error: "Only owners and admins can revoke invitations" };
  }

  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId)
    .eq("organization_id", active.organization_id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/settings/team");
  return { success: "Invitation revoked" };
}

/**
 * Create (or link) a team member account with email already confirmed.
 * Returns a one-time temporary password — never persisted in app tables.
 */
export async function createTeamUser(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = createTeamUserSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (!active || !canManageTeam(active.role)) {
    return { error: "Only owners and admins can create user accounts" };
  }

  try {
    await assertPlanAllows(active.organization_id, "team_members");
  } catch (error) {
    return actionErrorFromUnknown(error, "Plan limit reached");
  }

  const email = parsed.data.email.toLowerCase();
  const fullName = parsed.data.fullName;
  const role = parsed.data.role;
  const password = generateTemporaryPassword();
  const admin = createAdminClient();

  let userId = await findAuthUserIdByEmail(email);
  let createdNew = false;

  if (userId) {
    const { data: existingMembership } = await admin
      .from("organization_members")
      .select("id")
      .eq("organization_id", active.organization_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMembership) {
      return {
        error: `${email} is already a member of this organization`,
      };
    }
  }

  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      return {
        error: createError?.message ?? "Could not create auth user",
      };
    }

    userId = created.user.id;
    createdNew = true;
  } else {
    const { error: passwordError } = await admin.auth.admin.updateUserById(
      userId,
      { password, email_confirm: true },
    );
    if (passwordError) {
      return { error: passwordError.message };
    }
  }

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: fullName,
      must_change_password: true,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    return { error: `User created but profile failed: ${profileError.message}` };
  }

  const { error: memberError } = await admin.from("organization_members").insert({
    organization_id: active.organization_id,
    user_id: userId,
    role,
    invited_by: user.id,
    status: "active",
  });

  if (memberError) {
    return {
      error: `User ready but membership failed: ${memberError.message}`,
    };
  }

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: createdNew ? "team.user_created" : "team.user_linked",
    entityType: "organization_member",
    entityId: userId,
    summary: createdNew
      ? `Created account for ${email} as ${role}`
      : `Linked existing account ${email} as ${role}`,
    after: {
      email,
      role,
      full_name: fullName,
      must_change_password: true,
      created_new: createdNew,
    },
    meta: { email },
  });

  revalidatePath("/settings/team");
  return {
    success: createdNew
      ? `Account created for ${email}. Share the temporary password now — it is shown only once.`
      : `Existing account ${email} was added to this org. Temporary password shown only once.`,
    temporaryPassword: password,
    createdEmail: email,
  };
}

export async function resetTeamMemberPassword(
  _prev: OrgActionResult,
  formData: FormData,
): Promise<OrgActionResult> {
  const parsed = resetTeamMemberPasswordSchema.safeParse({
    memberId: formData.get("memberId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in" };
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (!active || !canManageTeam(active.role)) {
    return { error: "Only owners and admins can reset passwords" };
  }

  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin
    .from("organization_members")
    .select("id, user_id, role")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", active.organization_id)
    .single();

  if (memberError || !member) {
    return { error: "Member not found in this organization" };
  }

  if (member.user_id === user.id) {
    return { error: "Use Change password for your own account" };
  }

  const { data: authUser, error: authLookupError } =
    await admin.auth.admin.getUserById(member.user_id);

  if (authLookupError || !authUser.user) {
    return { error: "Could not load member auth record" };
  }

  const password = generateTemporaryPassword();
  const { error: passwordError } = await admin.auth.admin.updateUserById(
    member.user_id,
    { password },
  );

  if (passwordError) {
    return { error: passwordError.message };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", member.user_id);

  if (profileError) {
    return {
      error: `Password reset but could not set force-change flag: ${profileError.message}`,
    };
  }

  const email = authUser.user.email ?? member.user_id;

  await writeAuditEvent({
    organizationId: active.organization_id,
    actorUserId: user.id,
    action: "team.password_reset",
    entityType: "organization_member",
    entityId: member.user_id,
    summary: `Reset password for ${email}`,
    after: { must_change_password: true },
    meta: { email },
  });

  revalidatePath("/settings/team");
  return {
    success: `Password reset for ${email}. Share it now — shown only once. They must change it on next login.`,
    temporaryPassword: password,
    createdEmail: email,
  };
}
