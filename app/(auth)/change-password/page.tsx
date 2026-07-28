import { redirect } from "next/navigation";

import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentProfile } from "@/lib/org/session";
import { createClient } from "@/lib/supabase/server";

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/change-password");
  }

  const profile = await getCurrentProfile(user.id);
  const forced = Boolean(profile?.must_change_password);

  return (
    <AuthCard
      title={forced ? "Set a new password" : "Change password"}
      description={
        forced
          ? "Your admin created or reset this account. Choose a new password to continue."
          : "Use at least 8 characters."
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
