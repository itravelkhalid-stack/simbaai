import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteForm } from "@/components/team/accept-invite-form";
import { setInviteTokenCookie } from "@/lib/org/invite-cookie";
import type { InvitePreview } from "@/lib/org/invite-preview";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function loadInvitePreview(token: string): Promise<InvitePreview | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("email, role, status, expires_at, organizations(name)")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const org = data.organizations as { name?: string } | { name?: string }[] | null;
  const organizationName = Array.isArray(org)
    ? (org[0]?.name ?? "Organization")
    : (org?.name ?? "Organization");

  return {
    organizationName,
    email: data.email,
    role: data.role,
    status: data.status,
    expired:
      data.status === "expired" ||
      new Date(data.expires_at).getTime() < Date.now(),
  };
}

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";
  const queryError = params.error?.trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (token) {
    await setInviteTokenCookie(token);
  }

  const preview = token ? await loadInvitePreview(token) : null;

  const canAutoJoin =
    Boolean(user?.email) &&
    Boolean(preview) &&
    preview!.status === "pending" &&
    !preview!.expired &&
    preview!.email.toLowerCase() === user!.email!.toLowerCase();

  if (canAutoJoin && token && !queryError) {
    redirect(`/accept-invite/complete?token=${encodeURIComponent(token)}`);
  }

  let description = "Join the organization you were invited to.";
  if (preview) {
    description = `Join ${preview.organizationName} as ${preview.role.replace("org_", "")}.`;
  }

  return (
    <AuthCard title="Accept invitation" description={description}>
      <AcceptInviteForm
        token={token}
        signedIn={Boolean(user)}
        userEmail={user?.email ?? null}
        preview={preview}
        initialError={queryError}
      />
    </AuthCard>
  );
}
