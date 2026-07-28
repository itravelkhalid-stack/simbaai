import { TeamManagement, type TeamMemberRow } from "@/components/team/team-management";
import { canManageTeam } from "@/lib/org/session";
import { requireActiveOrg } from "@/lib/org/require";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Invitation } from "@/lib/types/database";

export default async function TeamSettingsPage() {
  const { user, active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: membersData, error: membersError } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", active.organization_id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new Error(membersError.message);
  }

  const userIds = (membersData ?? []).map((row) => row.user_id);
  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_url")
    .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const profileById = new Map(
    (profilesData ?? []).map((profile) => [profile.id, profile]),
  );

  const emailByUserId = new Map<string, string | null>();
  if (userIds.length > 0) {
    const admin = createAdminClient();
    await Promise.all(
      userIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id);
        emailByUserId.set(id, data.user?.email ?? null);
      }),
    );
  }

  const manage = canManageTeam(active.role);
  let invitations: Invitation[] = [];

  if (manage) {
    const { data: inviteData, error: inviteError } = await supabase
      .from("invitations")
      .select("*")
      .eq("organization_id", active.organization_id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    invitations = (inviteData ?? []) as Invitation[];
  }

  const members = (membersData ?? []).map((row) => {
    const profile = profileById.get(row.user_id);
    return {
      id: row.id,
      user_id: row.user_id,
      role: row.role,
      status: row.status,
      email: emailByUserId.get(row.user_id) ?? null,
      profile: profile
        ? { full_name: profile.full_name, avatar_url: profile.avatar_url }
        : null,
    } satisfies TeamMemberRow;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Team</h1>
        <p className="mt-2 text-muted-foreground">
          Create teammate accounts for {active.organization.name}, manage roles,
          or send an email invite as a secondary option.
        </p>
      </div>
      <TeamManagement
        members={members}
        invitations={invitations}
        canManage={manage}
        currentUserId={user.id}
      />
    </div>
  );
}
