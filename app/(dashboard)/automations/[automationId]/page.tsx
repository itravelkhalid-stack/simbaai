import { notFound } from "next/navigation";

import { AutomationBuilder } from "@/components/automations/automation-builder";
import { AutomationsNav } from "@/components/automations/automations-nav";
import { deleteAutomation, setAutomationStatus } from "@/lib/automations/actions";
import { Button } from "@/components/ui/button";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import type { Automation, AutomationRun } from "@/lib/types/automations";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ automationId: string }>;
}) {
  const { automationId } = await params;
  const { active } = await requireActiveOrg();
  const supabase = await createClient();

  const { data } = await supabase
    .from("automations")
    .select("*")
    .eq("id", automationId)
    .eq("organization_id", active.organization_id)
    .maybeSingle();
  if (!data) notFound();

  const automation = data as Automation;
  const { data: runs } = await supabase
    .from("automation_runs")
    .select("*")
    .eq("automation_id", automationId)
    .order("started_at", { ascending: false })
    .limit(30);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const webhookUrl = `${site}/api/automations/webhook/${automation.id}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <AutomationsNav current="/automations" />
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {automation.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {automation.description || "Vertical flow builder"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {automation.status !== "active" ? (
            <form action={setAutomationStatus}>
              <input type="hidden" name="id" value={automation.id} />
              <input type="hidden" name="status" value="active" />
              <Button type="submit" size="sm">
                Activate
              </Button>
            </form>
          ) : (
            <form action={setAutomationStatus}>
              <input type="hidden" name="id" value={automation.id} />
              <input type="hidden" name="status" value="paused" />
              <Button type="submit" size="sm" variant="outline">
                Pause
              </Button>
            </form>
          )}
          <form action={deleteAutomation}>
            <input type="hidden" name="id" value={automation.id} />
            <Button type="submit" size="sm" variant="destructive">
              Delete
            </Button>
          </form>
        </div>
      </div>

      <AutomationBuilder
        automation={automation}
        runs={(runs ?? []) as AutomationRun[]}
        webhookUrl={webhookUrl}
      />
    </div>
  );
}
