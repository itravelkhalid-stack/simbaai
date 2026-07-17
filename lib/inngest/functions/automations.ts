import { inngest } from "@/lib/inngest/client";
import {
  evaluateMetricAutomations,
  evaluateScheduleAutomations,
  runAutomation,
} from "@/lib/automations/runner";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Automation } from "@/lib/types/automations";

export const automationsScheduleTick = inngest.createFunction(
  {
    id: "automations/schedule-tick",
    retries: 1,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async ({ step }) => {
    return step.run("evaluate-schedules", async () =>
      evaluateScheduleAutomations(),
    );
  },
);

export const automationsMetricDaily = inngest.createFunction(
  {
    id: "automations/metric-daily",
    retries: 1,
    triggers: [{ cron: "10 7 * * *" }],
  },
  async ({ step }) => {
    return step.run("evaluate-metrics", async () => evaluateMetricAutomations());
  },
);

export const automationsRunRequested = inngest.createFunction(
  {
    id: "automations/run-requested",
    retries: 1,
    triggers: [{ event: "automation/run.requested" }],
  },
  async ({ event, step }) => {
    const automationId = String(event.data?.automationId ?? "");
    const triggerData = (event.data?.triggerData ?? {}) as Record<
      string,
      unknown
    >;
    return step.run("run", async () => {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("automations")
        .select("*")
        .eq("id", automationId)
        .single();
      if (!data) throw new Error("Automation not found");
      return runAutomation({
        automation: data as Automation,
        triggerData,
      });
    });
  },
);

export const automationsFunctions = [
  automationsScheduleTick,
  automationsMetricDaily,
  automationsRunRequested,
];
