import { createAdminClient } from "@/lib/supabase/admin";
import { getOrCreateBrandReportSettings } from "@/lib/reviews/periods";
import { createAndQueueReport } from "@/lib/reviews/run";
import type { ReportType } from "@/lib/types/reviews";

function utcWeekday(d: Date) {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

function isFirstDayOfQuarter(d: Date) {
  const m = d.getUTCMonth();
  return d.getUTCDate() === 1 && (m === 0 || m === 3 || m === 6 || m === 9);
}

export async function scheduleDueReports(now = new Date()) {
  const supabase = createAdminClient();
  const hour = now.getUTCHours();
  const dateKey = now.toISOString().slice(0, 10);
  const weekday = utcWeekday(now);
  const dayOfMonth = now.getUTCDate();

  const { data: brands } = await supabase
    .from("brands")
    .select("id, organization_id")
    .eq("agent_activity_paused", false);

  const created: Array<{ reportId: string; type: ReportType; brandId: string }> =
    [];

  for (const brand of brands ?? []) {
    const settings = await getOrCreateBrandReportSettings(
      brand.organization_id,
      brand.id,
    );
    const dueTypes: ReportType[] = [];

    if (settings.daily_enabled && settings.daily_hour_utc === hour) {
      dueTypes.push("daily");
    }
    if (
      settings.weekly_enabled &&
      settings.weekly_weekday === weekday &&
      settings.weekly_hour_utc === hour
    ) {
      dueTypes.push("weekly");
    }
    if (
      settings.monthly_enabled &&
      settings.monthly_day === dayOfMonth &&
      settings.monthly_hour_utc === hour
    ) {
      dueTypes.push("monthly");
    }
    if (
      settings.quarterly_enabled &&
      isFirstDayOfQuarter(now) &&
      settings.quarterly_hour_utc === hour
    ) {
      dueTypes.push("quarterly");
    }

    for (const type of dueTypes) {
      const { data: existing } = await supabase
        .from("reports")
        .select("id")
        .eq("organization_id", brand.organization_id)
        .eq("brand_id", brand.id)
        .eq("type", type)
        .gte("created_at", `${dateKey}T00:00:00.000Z`)
        .lte("created_at", `${dateKey}T23:59:59.999Z`)
        .limit(1);
      if (existing?.length) continue;

      const report = await createAndQueueReport({
        organizationId: brand.organization_id,
        brandId: brand.id,
        type,
        asOf: now,
      });
      created.push({ reportId: report.id, type, brandId: brand.id });
    }
  }

  return { created, hour, dateKey };
}
