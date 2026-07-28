import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Create your account"
      description="Verify your email, then join your team or create an organization."
    >
      <SignupForm next={params.next} />
    </AuthCard>
  );
}
