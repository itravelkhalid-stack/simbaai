import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      title="Sign in"
      description="Access your Simba AI workspace."
    >
      <LoginForm next={params.next} />
    </AuthCard>
  );
}
