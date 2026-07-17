import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInviteForm } from "@/components/team/accept-invite-form";
import { createClient } from "@/lib/supabase/server";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <AuthCard
      title="Accept invitation"
      description="Join the organization you were invited to."
    >
      <AcceptInviteForm token={params.token ?? ""} signedIn={Boolean(user)} />
    </AuthCard>
  );
}
