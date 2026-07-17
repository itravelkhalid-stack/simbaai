"use server";

import { revalidatePath } from "next/cache";

import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type {
  OnboardingStepId,
  OnboardingStepState,
} from "@/lib/types/platform";

export async function dismissOnboarding() {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  await supabase.from("org_onboarding_progress").upsert(
    {
      organization_id: active.organization_id,
      dismissed_at: new Date().toISOString(),
    },
    { onConflict: "organization_id" },
  );
  revalidatePath("/");
}

export async function markOnboardingStepDone(stepId: OnboardingStepId) {
  const { active } = await requireActiveOrg();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("org_onboarding_progress")
    .select("steps")
    .eq("organization_id", active.organization_id)
    .maybeSingle();

  const steps = {
    ...((existing?.steps as Record<string, OnboardingStepState> | null) ?? {}),
  };
  steps[stepId] = {
    done: true,
    completed_at: new Date().toISOString(),
    manual: true,
  };

  await supabase.from("org_onboarding_progress").upsert(
    {
      organization_id: active.organization_id,
      steps,
    },
    { onConflict: "organization_id" },
  );
  revalidatePath("/");
}
