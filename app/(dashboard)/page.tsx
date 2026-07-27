import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import {
  ActivityFeed,
  AttentionPanel,
  DashboardKpiRow,
  UpcomingMeetingsPanel,
} from "@/components/dashboard/home-panels";
import { PageHeader } from "@/components/dashboard/page-header";
import { loadDashboardHome } from "@/lib/dashboard/home";
import { getOnboardingChecklist } from "@/lib/onboarding/progress";
import { requireActiveOrg } from "@/lib/org/require";

export default async function DashboardHomePage() {
  const { active } = await requireActiveOrg();
  const [onboarding, home] = await Promise.all([
    getOnboardingChecklist({ organizationId: active.organization_id }),
    loadDashboardHome(active.organization_id),
  ]);

  const showOnboarding = !onboarding.complete && !onboarding.dismissed;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description={
          <>
            Welcome to {active.organization.name} — KPIs, blockers, and what is
            coming up next.
          </>
        }
      />

      {showOnboarding ? (
        <OnboardingChecklist
          steps={onboarding.steps}
          completedCount={onboarding.completedCount}
          total={onboarding.total}
        />
      ) : null}

      <DashboardKpiRow kpis={[...home.kpis]} />

      <AttentionPanel items={home.attention} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityFeed items={home.activity} />
        <UpcomingMeetingsPanel
          items={home.upcoming}
          timezone={home.timezone}
        />
      </div>
    </div>
  );
}
