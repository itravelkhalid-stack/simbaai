import { redirect } from "next/navigation";

import { CreateOrganizationForm } from "@/components/onboarding/create-organization-form";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveActiveOrganization } from "@/lib/org/session";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { active } = await resolveActiveOrganization(user.id);
  if (active) {
    redirect("/");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <Card className="w-full border-border/70 shadow-sm">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            GrowthOS
          </p>
          <CardTitle className="text-2xl">Create your organization</CardTitle>
          <CardDescription>
            Every brand gets an isolated workspace. You&apos;ll be the owner.
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <CreateOrganizationForm />
        </div>
      </Card>
    </div>
  );
}
