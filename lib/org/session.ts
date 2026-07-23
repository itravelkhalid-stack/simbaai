import { cookies } from "next/headers";

import {
  ACTIVE_ORG_COOKIE,
  IMPERSONATE_ORG_COOKIE,
} from "@/lib/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Organization,
  OrganizationMember,
  Profile,
} from "@/lib/types/database";

export type OrgMembership = OrganizationMember & {
  organization: Organization;
  impersonating?: boolean;
};

export async function getActiveOrganizationId() {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? null;
}

export async function setActiveOrganizationId(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveOrganizationId() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_ORG_COOKIE);
}

export async function getImpersonateOrganizationId() {
  const cookieStore = await cookies();
  return cookieStore.get(IMPERSONATE_ORG_COOKIE)?.value ?? null;
}

export async function setImpersonateOrganizationId(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_ORG_COOKIE, organizationId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8,
  });
}

export async function clearImpersonateOrganizationId() {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_ORG_COOKIE);
}

export async function isPlatformAdminUser(userId: string) {
  // Avoid crashing the whole dashboard when the service-role key is missing
  // in a misconfigured deploy; platform admin features simply stay off.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return false;
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function getUserMemberships(userId: string) {
  const supabase = await createClient();
  const { data: members, error } = await supabase
    .from("organization_members")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  if (!members?.length) {
    return [] as OrgMembership[];
  }

  const orgIds = members.map((member) => member.organization_id);
  const { data: organizations, error: orgError } = await supabase
    .from("organizations")
    .select("*")
    .in("id", orgIds);

  if (orgError) {
    throw new Error(orgError.message);
  }

  const orgById = new Map((organizations ?? []).map((org) => [org.id, org]));

  return members.flatMap((member) => {
    const organization = orgById.get(member.organization_id);
    if (!organization) return [];
    return [{ ...member, organization }];
  });
}

export async function resolveActiveOrganization(userId: string): Promise<{
  memberships: OrgMembership[];
  active: OrgMembership | null;
  isPlatformAdmin: boolean;
}> {
  const memberships = await getUserMemberships(userId);
  const impersonateId = await getImpersonateOrganizationId();
  const isAdmin = await isPlatformAdminUser(userId);

  if (isAdmin && impersonateId) {
    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("*")
      .eq("id", impersonateId)
      .maybeSingle();
    if (org) {
      const synthetic: OrgMembership = {
        id: `impersonate:${org.id}`,
        organization_id: org.id,
        user_id: userId,
        role: "org_admin",
        invited_by: null,
        status: "active",
        created_at: new Date().toISOString(),
        organization: org as Organization,
        impersonating: true,
      };
      // Prefer real membership role if exists
      const real = memberships.find((m) => m.organization_id === org.id);
      const active: OrgMembership = real
        ? { ...real, organization: org as Organization, impersonating: true }
        : synthetic;
      return { memberships, active, isPlatformAdmin: true };
    }
  }

  if (memberships.length === 0) {
    return {
      memberships,
      active: null,
      isPlatformAdmin: isAdmin,
    };
  }

  const cookieOrgId = await getActiveOrganizationId();
  const active =
    memberships.find((m) => m.organization_id === cookieOrgId) ??
    memberships[0];

  // Do not write cookies here — this runs inside Server Components during
  // render (e.g. dashboard layout after login). Next.js throws if cookies
  // are modified outside a Server Action or Route Handler. Persist the
  // active org via switch/create org server actions instead.

  return { memberships, active, isPlatformAdmin: isAdmin };
}

export async function getCurrentProfile(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile | null;
}

export function canManageTeam(role: OrganizationMember["role"] | undefined) {
  return role === "org_owner" || role === "org_admin";
}
