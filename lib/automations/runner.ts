import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildScheduleContext,
  evaluateConditions,
  metricCompare,
  scheduleMatchesNow,
} from "@/lib/automations/conditions";
import { executeAutomationAction } from "@/lib/automations/actions-exec";
import type {
  Automation,
  AutomationEventName,
  AutomationRun,
  EventTrigger,
  MetricThresholdTrigger,
  ScheduleTrigger,
} from "@/lib/types/automations";

export async function runAutomation(params: {
  automation: Automation;
  triggerData?: Record<string, unknown>;
  dryRun?: boolean;
}): Promise<AutomationRun> {
  const supabase = createAdminClient();
  const triggerData = {
    ...buildScheduleContext(),
    ...(params.triggerData ?? {}),
  };

  const { data: runRow, error: runError } = await supabase
    .from("automation_runs")
    .insert({
      organization_id: params.automation.organization_id,
      automation_id: params.automation.id,
      status: "running",
      trigger_data: triggerData,
      actions_executed: [],
    })
    .select("*")
    .single();
  if (runError || !runRow) {
    throw new Error(runError?.message ?? "Failed to create automation run");
  }

  try {
    if (!evaluateConditions(params.automation.conditions ?? [], triggerData)) {
      const { data: skipped } = await supabase
        .from("automation_runs")
        .update({
          status: "skipped",
          error: "Conditions not met",
          finished_at: new Date().toISOString(),
        })
        .eq("id", runRow.id)
        .select("*")
        .single();
      return (skipped ?? runRow) as AutomationRun;
    }

    const executed = [];
    for (const action of params.automation.actions ?? []) {
      const result = await executeAutomationAction({
        automation: params.automation,
        action,
        triggerData,
        dryRun: params.dryRun,
      });
      executed.push(result);
      if (!result.ok && !result.skipped) {
        // continue other actions but mark failed at end
      }
    }

    const failed = executed.some((e) => !e.ok && !e.skipped);
    const { data: finished } = await supabase
      .from("automation_runs")
      .update({
        status: failed ? "failed" : "success",
        actions_executed: executed,
        error: failed
          ? executed
              .filter((e) => !e.ok)
              .map((e) => e.detail)
              .join("; ")
          : null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runRow.id)
      .select("*")
      .single();

    if (!params.dryRun) {
      await supabase
        .from("automations")
        .update({
          last_run_at: new Date().toISOString(),
          run_count: (params.automation.run_count ?? 0) + 1,
        })
        .eq("id", params.automation.id);
    }

    return (finished ?? runRow) as AutomationRun;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Run failed";
    const { data: failed } = await supabase
      .from("automation_runs")
      .update({
        status: "failed",
        error: message,
        finished_at: new Date().toISOString(),
      })
      .eq("id", runRow.id)
      .select("*")
      .single();
    return (failed ?? runRow) as AutomationRun;
  }
}

export async function emitAutomationEvent(params: {
  organizationId: string;
  brandId?: string | null;
  event: AutomationEventName;
  data?: Record<string, unknown>;
}) {
  const supabase = createAdminClient();
  let query = supabase
    .from("automations")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("status", "active");
  if (params.brandId) {
    query = query.eq("brand_id", params.brandId);
  }
  const { data: automations } = await query.limit(100);
  const runs = [];

  for (const raw of automations ?? []) {
    const automation = raw as Automation;
    const trigger = automation.trigger as EventTrigger;
    if (trigger?.type !== "event" || trigger.event !== params.event) continue;
    if (
      params.event === "contact.tagged" &&
      trigger.tag &&
      params.data?.tag &&
      String(params.data.tag).toLowerCase() !== trigger.tag.toLowerCase()
    ) {
      continue;
    }
    const run = await runAutomation({
      automation,
      triggerData: {
        event: params.event,
        ...(params.data ?? {}),
      },
    });
    runs.push(run);
  }
  return runs;
}

export async function evaluateMetricAutomations() {
  const supabase = createAdminClient();
  const { data: automations } = await supabase
    .from("automations")
    .select("*")
    .eq("status", "active")
    .limit(200);

  let fired = 0;
  for (const raw of automations ?? []) {
    const automation = raw as Automation;
    const trigger = automation.trigger as MetricThresholdTrigger;
    if (trigger?.type !== "metric_threshold") continue;

    const actual = await computeMetric({
      organizationId: automation.organization_id,
      brandId: automation.brand_id,
      trigger,
    });
    if (actual == null) continue;
    if (!metricCompare(actual, trigger.op, trigger.value)) continue;

    // Avoid re-firing more than once per day
    if (automation.last_run_at) {
      const last = new Date(automation.last_run_at).getTime();
      if (Date.now() - last < 20 * 60 * 60 * 1000) continue;
    }

    await runAutomation({
      automation,
      triggerData: {
        metric: trigger.metric,
        actual,
        threshold: trigger.value,
        op: trigger.op,
        days: trigger.days,
        campaign_id: (await findWorstCampaign(automation)) ?? undefined,
      },
    });
    fired += 1;
  }
  return { fired };
}

export async function evaluateScheduleAutomations(now = new Date()) {
  const supabase = createAdminClient();
  const { data: automations } = await supabase
    .from("automations")
    .select("*")
    .eq("status", "active")
    .limit(200);

  let fired = 0;
  for (const raw of automations ?? []) {
    const automation = raw as Automation;
    const trigger = automation.trigger as ScheduleTrigger;
    if (trigger?.type !== "schedule") continue;
    if (!scheduleMatchesNow(trigger, now)) continue;

    if (automation.last_run_at) {
      const last = new Date(automation.last_run_at);
      // Prevent double-fire within same UTC hour for daily/weekly
      if (
        last.toISOString().slice(0, 13) === now.toISOString().slice(0, 13)
      ) {
        continue;
      }
    }

    await runAutomation({
      automation,
      triggerData: buildScheduleContext(now),
    });
    fired += 1;
  }
  return { fired };
}

async function computeMetric(params: {
  organizationId: string;
  brandId: string;
  trigger: MetricThresholdTrigger;
}): Promise<number | null> {
  const supabase = createAdminClient();
  const days = Math.max(1, params.trigger.days ?? 1);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  if (params.trigger.metric === "scheduled_posts") {
    const { count } = await supabase
      .from("content_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("status", "scheduled");
    return count ?? 0;
  }

  if (params.trigger.metric === "sessions") {
    const { data } = await supabase
      .from("analytics_daily")
      .select("sessions")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .gte("metric_date", sinceDate);
    return (data ?? []).reduce((a, r) => a + (r.sessions ?? 0), 0);
  }

  // Ads metrics
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId);
  const ids = (campaigns ?? []).map((c) => c.id);
  if (!ids.length) return null;

  const { data: metrics } = await supabase
    .from("ad_metrics_daily")
    .select("spend_pence, revenue_pence, impressions, clicks")
    .eq("organization_id", params.organizationId)
    .in("campaign_id", ids)
    .gte("metric_date", sinceDate)
    .limit(5000);

  const spend = (metrics ?? []).reduce((a, m) => a + (m.spend_pence ?? 0), 0);
  const revenue = (metrics ?? []).reduce(
    (a, m) => a + (m.revenue_pence ?? 0),
    0,
  );
  const impressions = (metrics ?? []).reduce(
    (a, m) => a + (m.impressions ?? 0),
    0,
  );
  const clicks = (metrics ?? []).reduce((a, m) => a + (m.clicks ?? 0), 0);

  if (params.trigger.metric === "spend_pence") return spend;
  if (params.trigger.metric === "roas") {
    return spend > 0 ? revenue / spend : null;
  }
  if (params.trigger.metric === "ctr") {
    return impressions > 0 ? clicks / impressions : null;
  }
  return null;
}

async function findWorstCampaign(automation: Automation) {
  const supabase = createAdminClient();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceDate = since.toISOString().slice(0, 10);
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("id")
    .eq("organization_id", automation.organization_id)
    .eq("brand_id", automation.brand_id)
    .eq("status", "active");
  if (!campaigns?.length) return null;

  let worst: { id: string; roas: number } | null = null;
  for (const c of campaigns) {
    const { data: metrics } = await supabase
      .from("ad_metrics_daily")
      .select("spend_pence, revenue_pence")
      .eq("campaign_id", c.id)
      .gte("metric_date", sinceDate);
    const spend = (metrics ?? []).reduce((a, m) => a + (m.spend_pence ?? 0), 0);
    const revenue = (metrics ?? []).reduce(
      (a, m) => a + (m.revenue_pence ?? 0),
      0,
    );
    if (spend <= 0) continue;
    const roas = revenue / spend;
    if (!worst || roas < worst.roas) worst = { id: c.id, roas };
  }
  return worst?.id ?? null;
}
