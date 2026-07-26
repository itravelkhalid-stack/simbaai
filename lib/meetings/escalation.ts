import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOrgAdmins } from "@/lib/notifications/notify";

const OFF_TARGET_THRESHOLD = 25;

type KpiVariance = {
  metric_key: string;
  label: string;
  variance_pct: number | null;
};

/**
 * Escalate when any brand KPI is >25% off target for 2 consecutive weekly meetings.
 */
export async function evaluateWeeklyKpiEscalation(params: {
  organizationId: string;
  brandId: string;
  meetingId: string;
  currentVariances: KpiVariance[];
}): Promise<{ escalated: boolean; metrics: string[] }> {
  const offNow = params.currentVariances.filter(
    (k) =>
      k.variance_pct != null && Math.abs(k.variance_pct) > OFF_TARGET_THRESHOLD,
  );
  if (!offNow.length) {
    return { escalated: false, metrics: [] };
  }

  const supabase = createAdminClient();
  const { data: prior } = await supabase
    .from("meetings")
    .select("id, context_snapshot, completed_at")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("type", "weekly_marketing")
    .eq("status", "complete")
    .neq("id", params.meetingId)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!prior?.context_snapshot) {
    return { escalated: false, metrics: [] };
  }

  const priorKpis = (
    (prior.context_snapshot as { brand_kpis?: KpiVariance[] }).brand_kpis ?? []
  );
  const priorOff = new Set(
    priorKpis
      .filter(
        (k) =>
          k.variance_pct != null &&
          Math.abs(k.variance_pct) > OFF_TARGET_THRESHOLD,
      )
      .map((k) => k.metric_key),
  );

  const consecutive = offNow.filter((k) => priorOff.has(k.metric_key));
  if (!consecutive.length) {
    return { escalated: false, metrics: [] };
  }

  const metrics = consecutive.map((k) => k.label || k.metric_key);
  await supabase
    .from("meetings")
    .update({ escalation_flagged: true })
    .eq("id", params.meetingId);

  await notifyOrgAdmins({
    organizationId: params.organizationId,
    title: "Meeting escalation: KPI off target 2 weeks",
    body: `${metrics.join(", ")} remain >${OFF_TARGET_THRESHOLD}% off target across two weekly marketing meetings.`,
    link: `/meetings/${params.meetingId}`,
    category: "anomalies",
  });

  return { escalated: true, metrics };
}
