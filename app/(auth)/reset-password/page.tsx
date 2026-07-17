import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      description="Use at least 8 characters."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
