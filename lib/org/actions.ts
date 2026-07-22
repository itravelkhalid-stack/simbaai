"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendInvitationEmail } from "@/lib/email/resend";
import {
  canManageTeam,
  resolveActiveOrganization,
  setActiveOrganizationId,
} from "@/lib/org/session";
import { createClient } from "@/lib/supabase/server";
import { assertPlanAllows } from "@/lib/billing/plans";
import {
  createOrganizationSchema,
  inviteMemberSchema,
  removeMemberSchema,
  switchOrgSchema,
  updateMemberRoleSchema,
} from "@/lib/validations/auth";

export type OrgActionResult = {
  error?: string;
  success?: string;
};

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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
    return { error: error instanceof Error ? error.message : "Plan limit reached" };
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
    await sendInvitationEmail({
      to: email,
      organizationName: active.organization.name,
      inviteUrl,
      role: parsed.data.role,
    });
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Invite created but email failed: ${err.message}`
          : "Invite created but email failed",
    };
  }

  revalidatePath("/settings/team");
  return { success: `Invitation sent to ${email}` };
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
    return { error: error.message };
  }

  const membership = Array.isArray(data) ? data[0] : data;
  if (membership?.organization_id) {
    await setActiveOrganizationId(membership.organization_id);
  }

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
