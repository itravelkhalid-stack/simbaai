import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_BRAND_REPORT_SETTINGS,
  type BrandKpi,
  type BrandReportSettings,
  type ReportType,
} from "@/lib/types/reviews";

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** Inclusive period for a report type ending on `asOf` (usually yesterday for overnight daily). */
export function periodForReportType(
  type: ReportType,
  asOf = new Date(),
): { periodStart: string; periodEnd: string; previousStart: string; previousEnd: string } {
  const end = new Date(
    Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate()),
  );
  // Daily overnight: report for yesterday
  if (type === "daily") {
    end.setUTCDate(end.getUTCDate() - 1);
    const periodEnd = isoDate(end);
    const periodStart = periodEnd;
    const previousEnd = addDays(periodStart, -1);
    return {
      periodStart,
      periodEnd,
      previousStart: previousEnd,
      previousEnd,
    };
  }

  if (type === "weekly") {
    // Week ending yesterday (Mon–Sun style: last 7 days ending yesterday)
    end.setUTCDate(end.getUTCDate() - 1);
    const periodEnd = isoDate(end);
    const periodStart = addDays(periodEnd, -6);
    const previousEnd = addDays(periodStart, -1);
    const previousStart = addDays(previousEnd, -6);
    return { periodStart, periodEnd, previousStart, previousEnd };
  }

  if (type === "monthly") {
    // Previous calendar month when run on the 1st; otherwise last 30 days ending yesterday
    const day = asOf.getUTCDate();
    if (day === 1) {
      const prevMonthEnd = new Date(
        Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 0),
      );
      const prevMonthStart = new Date(
        Date.UTC(prevMonthEnd.getUTCFullYear(), prevMonthEnd.getUTCMonth(), 1),
      );
      const periodStart = isoDate(prevMonthStart);
      const periodEnd = isoDate(prevMonthEnd);
      const priorEnd = new Date(
        Date.UTC(prevMonthStart.getUTCFullYear(), prevMonthStart.getUTCMonth(), 0),
      );
      const priorStart = new Date(
        Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1),
      );
      return {
        periodStart,
        periodEnd,
        previousStart: isoDate(priorStart),
        previousEnd: isoDate(priorEnd),
      };
    }
    end.setUTCDate(end.getUTCDate() - 1);
    const periodEnd = isoDate(end);
    const periodStart = addDays(periodEnd, -29);
    const previousEnd = addDays(periodStart, -1);
    const previousStart = addDays(previousEnd, -29);
    return { periodStart, periodEnd, previousStart, previousEnd };
  }

  // quarterly — previous calendar quarter when on quarter start
  const month = asOf.getUTCMonth();
  const isQuarterStart =
    asOf.getUTCDate() === 1 && (month === 0 || month === 3 || month === 6 || month === 9);
  if (isQuarterStart) {
    const qEndMonth = month === 0 ? 11 : month - 1;
    const qEndYear = month === 0 ? asOf.getUTCFullYear() - 1 : asOf.getUTCFullYear();
    const qStartMonth = qEndMonth - 2;
    const periodStart = isoDate(new Date(Date.UTC(qEndYear, qStartMonth, 1)));
    const periodEnd = isoDate(new Date(Date.UTC(qEndYear, qEndMonth + 1, 0)));
    const prevEnd = new Date(Date.UTC(qEndYear, qStartMonth, 0));
    const prevStart = new Date(
      Date.UTC(prevEnd.getUTCFullYear(), prevEnd.getUTCMonth() - 2, 1),
    );
    return {
      periodStart,
      periodEnd,
      previousStart: isoDate(prevStart),
      previousEnd: isoDate(prevEnd),
    };
  }
  end.setUTCDate(end.getUTCDate() - 1);
  const periodEnd = isoDate(end);
  const periodStart = addDays(periodEnd, -89);
  const previousEnd = addDays(periodStart, -1);
  const previousStart = addDays(previousEnd, -89);
  return { periodStart, periodEnd, previousStart, previousEnd };
}

export async function getOrCreateBrandReportSettings(
  organizationId: string,
  brandId: string,
): Promise<BrandReportSettings> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("brand_report_settings")
    .select("*")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (existing) return existing as BrandReportSettings;

  const { data, error } = await supabase
    .from("brand_report_settings")
    .insert({
      organization_id: organizationId,
      brand_id: brandId,
      ...DEFAULT_BRAND_REPORT_SETTINGS,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create report settings");
  return data as BrandReportSettings;
}

export async function listBrandKpis(brandId: string): Promise<BrandKpi[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("brand_kpis")
    .select("*")
    .eq("brand_id", brandId)
    .order("sort_order", { ascending: true });
  return (data ?? []) as BrandKpi[];
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
