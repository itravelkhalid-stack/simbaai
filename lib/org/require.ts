import { redirect } from "next/navigation";

import { getInviteTokenCookie } from "@/lib/org/invite-cookie";
import {
  getCurrentProfile,
  resolveActiveOrganization,
  type OrgMembership,
} from "@/lib/org/session";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";
import type { User } from "@supabase/supabase-js";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function requireActiveOrg(): Promise<{
  user: User;
  active: OrgMembership;
  memberships: OrgMembership[];
  profile: Profile | null;
}> {
  const { user } = await requireUser();
  const { memberships, active } = await resolveActiveOrganization(user.id);

  if (!active) {
    const inviteToken = await getInviteTokenCookie();
    if (inviteToken) {
      redirect(`/accept-invite?token=${encodeURIComponent(inviteToken)}`);
    }
    redirect("/onboarding");
  }

  const profile = await getCurrentProfile(user.id);
  return { user, active, memberships, profile };
}
