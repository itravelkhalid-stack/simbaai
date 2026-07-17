import Link from "next/link";
import { notFound } from "next/navigation";

import { EmailNav } from "@/components/email/email-nav";
import { writeApprovedFlowEmails } from "@/lib/email/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { EmailFlow, EmailFlowStep } from "@/lib/types/email";
import { cn } from "@/lib/utils";

export default async function FlowDetailPage({
  params,
}: {
  params: Promise<{ flowId: string }>;
}) {
  const { flowId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data: flow } = await supabase
    .from("email_flows")
    .select("*")
    .eq("id", flowId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!flow) notFound();

  const { data: steps } = await supabase
    .from("email_flow_steps")
    .select("*")
    .eq("flow_id", flowId)
    .order("position", { ascending: true });

  const f = flow as EmailFlow;
  const strategy = f.strategy as {
    strategy_summary?: string;
    emails?: Array<{
      position: number;
      delay_hours: number;
      goal: string;
      subject: string;
      preheader: string;
      angle: string;
    }>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <EmailNav current="/email/flows" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">{f.name}</h1>
          <p className="text-sm text-muted-foreground">
            Trigger: {f.trigger_type} · Status: {f.status}
          </p>
        </div>
        <Link
          href="/email/flows"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          All flows
        </Link>
      </div>

      {strategy.strategy_summary ? (
        <div className="rounded-xl border p-4">
          <p className="text-sm font-medium">Proposed strategy</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {strategy.strategy_summary}
          </p>
          <ul className="mt-4 space-y-3">
            {(strategy.emails ?? []).map((email) => (
              <li key={email.position} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">
                  Email {email.position} · +{email.delay_hours}h
                </p>
                <p className="text-muted-foreground">Goal: {email.goal}</p>
                <p>Subject: {email.subject}</p>
                <p className="text-muted-foreground">Angle: {email.angle}</p>
              </li>
            ))}
          </ul>
          <form action={writeApprovedFlowEmails} className="mt-4">
            <input type="hidden" name="flowId" value={f.id} />
            <Button type="submit">Approve & write emails</Button>
          </form>
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Written steps</h2>
        {((steps ?? []) as EmailFlowStep[]).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No emails written yet — approve the strategy above.
          </p>
        ) : (
          ((steps ?? []) as EmailFlowStep[]).map((step) => (
            <div key={step.id} className="rounded-xl border p-4">
              <p className="font-medium">
                Step {step.position} · delay {step.delay_hours}h
              </p>
              <p className="text-sm">{step.subject}</p>
              {step.goal ? (
                <p className="text-sm text-muted-foreground">Goal: {step.goal}</p>
              ) : null}
              <iframe
                title={`step-${step.position}`}
                className="mt-3 h-[320px] w-full rounded-lg border bg-white"
                srcDoc={step.html_content}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
