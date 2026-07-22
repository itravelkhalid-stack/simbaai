import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  OnboardingStepId,
  OrgOnboardingProgress,
} from "@/lib/types/platform";
import { ONBOARDING_STEPS } from "@/lib/types/platform";

export type OnboardingStepView = {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  done: boolean;
};

export async function getOnboardingChecklist(params: {
  organizationId: string;
}): Promise<{
  steps: OnboardingStepView[];
  completedCount: number;
  total: number;
  complete: boolean;
  dismissed: boolean;
}> {
  const supabase = await createClient();
  const admin = createAdminClient();

  const [{ data: progress }, detected] = await Promise.all([
    supabase
      .from("org_onboarding_progress")
      .select("*")
      .eq("organization_id", params.organizationId)
      .maybeSingle(),
    detectOnboardingSteps(params.organizationId),
  ]);

  const stored = (progress as OrgOnboardingProgress | null)?.steps ?? {};
  const steps = ONBOARDING_STEPS.map((s) => {
    const manual = stored[s.id];
    const done = Boolean(manual?.done || detected[s.id]);
    return { ...s, done };
  });

  const completedCount = steps.filter((s) => s.done).length;
  const complete = completedCount === steps.length;
  const progressRow = progress as OrgOnboardingProgress | null;

  if (complete && progressRow && !progressRow.completed_at) {
    await admin.from("org_onboarding_progress").upsert({
      organization_id: params.organizationId,
      steps: stored,
      completed_at: new Date().toISOString(),
    });
  }

  return {
    steps,
    completedCount,
    total: steps.length,
    complete,
    dismissed: Boolean(progressRow?.dismissed_at),
  };
}

async function detectOnboardingSteps(
  organizationId: string,
): Promise<Record<OnboardingStepId, boolean>> {
  const supabase = createAdminClient();

  const [
    { count: brands },
    { count: brandAudits },
    { count: social },
    { count: researchDone },
    { count: contentApproved },
    { data: reportSettings },
  ] = await Promise.all([
    supabase
      .from("brands")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("research_projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("type", "brand_audit"),
    supabase
      .from("social_connections")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("research_projects")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "complete"),
    supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["approved", "scheduled", "published"]),
    supabase
      .from("brand_report_settings")
      .select("id, daily_enabled, weekly_enabled, monthly_enabled")
      .eq("organization_id", organizationId)
      .limit(5),
  ]);

  // brand setup: brand exists with non-empty guidelines or name
  const { data: brandRows } = await supabase
    .from("brands")
    .select("name, guidelines, brand_voice, positioning")
    .eq("organization_id", organizationId)
    .limit(5);
  const setupBrand = (brandRows ?? []).some(
    (b) =>
      Boolean(b.name) &&
      (Boolean(b.brand_voice) ||
        Boolean(b.positioning) ||
        (b.guidelines &&
          typeof b.guidelines === "object" &&
          Object.keys(b.guidelines as object).length > 0)),
  );

  const extractedBrand = (brandRows ?? []).some((b) => {
    const g = b.guidelines as Record<string, unknown> | null;
    return Boolean(g && (g.last_extraction_at || g.last_extraction_url));
  });

  const reportScheduled = (reportSettings ?? []).some(
    (r) =>
      Boolean(
        (r as { daily_enabled?: boolean }).daily_enabled ||
          (r as { weekly_enabled?: boolean }).weekly_enabled ||
          (r as { monthly_enabled?: boolean }).monthly_enabled,
      ),
  );

  return {
    setup_brand: setupBrand || (brands ?? 0) > 0,
    ai_brand_extraction: extractedBrand || (brandAudits ?? 0) > 0,
    connect_social: (social ?? 0) > 0,
    first_research: (researchDone ?? 0) > 0,
    approve_content: (contentApproved ?? 0) > 0,
    schedule_report: reportScheduled,
  };
}
