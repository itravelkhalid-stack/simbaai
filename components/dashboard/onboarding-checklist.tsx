import Link from "next/link";

import {
  dismissOnboarding,
  markOnboardingStepDone,
} from "@/lib/onboarding/actions";
import type { OnboardingStepView } from "@/lib/onboarding/progress";
import type { OnboardingStepId } from "@/lib/types/platform";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

async function markStep(formData: FormData) {
  "use server";
  const stepId = String(formData.get("stepId") ?? "") as OnboardingStepId;
  if (!stepId) return;
  await markOnboardingStepDone(stepId);
}

export function OnboardingChecklist({
  steps,
  completedCount,
  total,
}: {
  steps: OnboardingStepView[];
  completedCount: number;
  total: number;
}) {
  const pct = total ? Math.round((completedCount / total) * 100) : 0;

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Hiring your AI marketing agency</CardTitle>
          <CardDescription className="mt-1">
            Complete these steps to get GrowthOS working like a retained team.
          </CardDescription>
        </div>
        <form action={dismissOnboarding}>
          <Button type="submit" size="sm" variant="ghost">
            Dismiss
          </Button>
        </form>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>
              {completedCount} of {total} complete
            </span>
            <span>{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
        <ul className="space-y-2">
          {steps.map((step) => (
            <li
              key={step.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2"
            >
              <div className="min-w-0">
                <p
                  className={
                    step.done
                      ? "text-sm text-muted-foreground line-through"
                      : "text-sm font-medium"
                  }
                >
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {step.done ? (
                  <span className="text-xs font-medium text-emerald-700">Done</span>
                ) : (
                  <>
                    <Link
                      href={step.href}
                      className="text-sm underline-offset-4 hover:underline"
                    >
                      Open
                    </Link>
                    <form action={markStep}>
                      <input type="hidden" name="stepId" value={step.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Mark done
                      </Button>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
