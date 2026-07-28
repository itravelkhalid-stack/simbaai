import { redirect } from "next/navigation";

import { SimbaWordmark } from "@/components/brand/simba-wordmark";
import { CreateOrganizationForm } from "@/components/onboarding/create-organization-form";
import { PendingInvitesJoin } from "@/components/onboarding/pending-invites-join";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { listPendingInvitationsForCurrentUser } from "@/lib/org/pending-invites";
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

  const pendingInvites = await listPendingInvitationsForCurrentUser();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <SimbaWordmark className="mb-2" />
          <CardTitle className="text-2xl">
            {pendingInvites.length > 0
              ? "Join your team"
              : "Create your organization"}
          </CardTitle>
          <CardDescription>
            {pendingInvites.length > 0
              ? "Accept an invitation to skip creating a new workspace."
              : "Every brand gets an isolated workspace. You&apos;ll be the owner."}
          </CardDescription>
        </CardHeader>
        <div className="space-y-8 px-6 pb-6">
          <PendingInvitesJoin invites={pendingInvites} />
          {pendingInvites.length > 0 ? (
            <div className="space-y-3 border-t pt-6">
              <h2 className="text-sm font-medium text-muted-foreground">
                Or create a new organization
              </h2>
              <CreateOrganizationForm />
            </div>
          ) : (
            <CreateOrganizationForm />
          )}
        </div>
      </Card>
    </div>
  );
}
