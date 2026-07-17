import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Start with email verification, then create your organization."
    >
      <SignupForm />
    </AuthCard>
  );
}
