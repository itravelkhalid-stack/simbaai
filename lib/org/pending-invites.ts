import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PendingInviteForUser = {
  id: string;
  token: string;
  role: string;
  expires_at: string;
  organization_id: string;
  organization_name: string;
};

/** Pending invites for the signed-in user's email (email-match join path). */
export async function listPendingInvitationsForCurrentUser(): Promise<
  PendingInviteForUser[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return [];

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("id, token, role, expires_at, organization_id, organizations(name)")
    .eq("email", user.email.toLowerCase())
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[invites] list pending for user failed", error);
    return [];
  }

  return data.map((row) => {
    const org = row.organizations as
      | { name?: string }
      | { name?: string }[]
      | null;
    const organization_name = Array.isArray(org)
      ? (org[0]?.name ?? "Organization")
      : (org?.name ?? "Organization");
    return {
      id: row.id,
      token: row.token,
      role: row.role,
      expires_at: row.expires_at,
      organization_id: row.organization_id,
      organization_name,
    };
  });
}
