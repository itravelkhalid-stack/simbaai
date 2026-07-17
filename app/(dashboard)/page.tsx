import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { getOnboardingChecklist } from "@/lib/onboarding/progress";
import { requireActiveOrg } from "@/lib/org/require";

export default async function DashboardHomePage() {
  const { active } = await requireActiveOrg();
  const onboarding = await getOnboardingChecklist({
    organizationId: active.organization_id,
  });

  const showOnboarding =
    !onboarding.complete && !onboarding.dismissed;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Welcome to {active.organization.name}. Modules below are scaffolded and
          ready for agent workflows.
        </p>
      </div>

      {showOnboarding ? (
        <OnboardingChecklist
          steps={onboarding.steps}
          completedCount={onboarding.completedCount}
          total={onboarding.total}
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Active organization</CardTitle>
            <CardDescription>
              {active.organization.name} · {active.organization.slug} · plan{" "}
              {active.organization.plan}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Your role</CardTitle>
            <CardDescription>{active.role.replace("org_", "")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
