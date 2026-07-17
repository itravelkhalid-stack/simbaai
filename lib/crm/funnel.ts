import { createAdminClient } from "@/lib/supabase/admin";
import {
  LIFECYCLE_STAGES,
  type FunnelStageStat,
} from "@/lib/types/crm";

export type { FunnelStageStat };

export async function getLifecycleFunnel(params: {
  organizationId: string;
  brandId?: string | null;
  /** Days for "current" window ending now; previous is the prior equal window */
  windowDays?: number;
}): Promise<FunnelStageStat[]> {
  const supabase = createAdminClient();
  const days = params.windowDays ?? 30;
  const now = new Date();
  const currentStart = new Date(now);
  currentStart.setUTCDate(currentStart.getUTCDate() - days);
  const previousStart = new Date(currentStart);
  previousStart.setUTCDate(previousStart.getUTCDate() - days);

  let query = supabase
    .from("crm_contacts")
    .select("lifecycle_stage, created_at, updated_at")
    .eq("organization_id", params.organizationId);
  if (params.brandId) query = query.eq("brand_id", params.brandId);

  const { data } = await query;
  const contacts = data ?? [];

  // Snapshot counts by current stage (all contacts) + how many entered/touched in windows
  const currentCounts: Record<string, number> = {};
  const previousCounts: Record<string, number> = {};
  for (const s of LIFECYCLE_STAGES) {
    currentCounts[s] = 0;
    previousCounts[s] = 0;
  }

  for (const c of contacts) {
    const stage = c.lifecycle_stage as string;
    if (stage in currentCounts) currentCounts[stage] += 1;

    const updated = new Date(c.updated_at).getTime();
    if (updated >= currentStart.getTime()) {
      // already counted in current snapshot — for period comparison use contacts
      // updated in previous window as a proxy for prior funnel shape
    }
    if (
      updated >= previousStart.getTime() &&
      updated < currentStart.getTime()
    ) {
      if (stage in previousCounts) previousCounts[stage] += 1;
    }
  }

  // Prefer full-funnel current stage distribution; previous = contacts last touched in prior window
  // Fall back: if previous empty, use same distribution scaled by zero
  const usePrevious =
    Object.values(previousCounts).some((n) => n > 0)
      ? previousCounts
      : Object.fromEntries(LIFECYCLE_STAGES.map((s) => [s, 0]));

  // For conversion rates use cumulative funnel (subscriber → … → customer), excluding churned from forward path
  const forward = LIFECYCLE_STAGES.filter((s) => s !== "churned");

  return LIFECYCLE_STAGES.map((stage, idx) => {
    const count = currentCounts[stage] ?? 0;
    const previous_count = usePrevious[stage] ?? 0;
    let conversion_from_prev_pct: number | null = null;
    let previous_conversion_pct: number | null = null;

    if (stage !== "churned" && idx > 0) {
      const prevStage = forward[forward.indexOf(stage) - 1];
      if (prevStage) {
        const prevCount = currentCounts[prevStage] ?? 0;
        conversion_from_prev_pct =
          prevCount === 0 ? null : Math.round((count / prevCount) * 1000) / 10;
        const prevPrev = usePrevious[prevStage] ?? 0;
        previous_conversion_pct =
          prevPrev === 0
            ? null
            : Math.round(((usePrevious[stage] ?? 0) / prevPrev) * 1000) / 10;
      }
    }

    return {
      stage,
      count,
      previous_count,
      conversion_from_prev_pct,
      previous_conversion_pct,
    };
  });
}

export async function sumCrmRevenuePence(params: {
  organizationId: string;
  brandId: string;
  fromDate: string;
  toDate: string;
}) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("crm_orders")
    .select("order_total_pence")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .gte("ordered_at", `${params.fromDate}T00:00:00.000Z`)
    .lte("ordered_at", `${params.toDate}T23:59:59.999Z`);
  return (data ?? []).reduce((s, r) => s + (r.order_total_pence ?? 0), 0);
}
