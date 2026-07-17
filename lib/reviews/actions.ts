"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { inngest } from "@/lib/inngest/client";
import { requireActiveOrg } from "@/lib/org/require";
import { createClient } from "@/lib/supabase/server";
import { createAndQueueReport } from "@/lib/reviews/run";
import { getOrCreateBrandReportSettings } from "@/lib/reviews/periods";
import { emailReport } from "@/lib/reviews/email";
import type { Report, ReportContent } from "@/lib/types/reviews";
import { REPORT_TYPE_LABELS } from "@/lib/types/reviews";

export type ReviewsActionResult = { error?: string; success?: string };

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot modify reviews");
  }
  return ctx;
}

const reportTypeSchema = z.enum(["daily", "weekly", "monthly", "quarterly"]);

export async function generateReportNow(
  _prev: ReviewsActionResult,
  formData: FormData,
): Promise<ReviewsActionResult> {
  try {
    const { active } = await assertCanWrite();
    const type = reportTypeSchema.parse(String(formData.get("type") ?? "weekly"));
    const brandId = String(formData.get("brandId") ?? "");
    if (!brandId) return { error: "Select a brand" };

    const report = await createAndQueueReport({
      organizationId: active.organization_id,
      brandId,
      type,
    });

    await inngest.send({
      name: "reviews/run",
      data: { reportId: report.id },
    });

    revalidatePath("/reviews");
    return { success: `Queued ${REPORT_TYPE_LABELS[type]} report` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function saveBrandReportSettings(
  _prev: ReviewsActionResult,
  formData: FormData,
): Promise<ReviewsActionResult> {
  try {
    const { active } = await assertCanWrite();
    if (active.role !== "org_owner" && active.role !== "org_admin") {
      return { error: "Only owners/admins can change report settings" };
    }
    const brandId = String(formData.get("brandId") ?? "");
    if (!brandId) return { error: "Missing brand" };

    await getOrCreateBrandReportSettings(active.organization_id, brandId);
    const supabase = await createClient();
    const recipients = String(formData.get("recipients") ?? "")
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    const { error } = await supabase
      .from("brand_report_settings")
      .update({
        daily_enabled: formData.get("dailyEnabled") === "on",
        daily_hour_utc: Number(formData.get("dailyHour") ?? 5),
        weekly_enabled: formData.get("weeklyEnabled") === "on",
        weekly_weekday: Number(formData.get("weeklyWeekday") ?? 1),
        weekly_hour_utc: Number(formData.get("weeklyHour") ?? 8),
        monthly_enabled: formData.get("monthlyEnabled") === "on",
        monthly_day: Number(formData.get("monthlyDay") ?? 1),
        monthly_hour_utc: Number(formData.get("monthlyHour") ?? 9),
        quarterly_enabled: formData.get("quarterlyEnabled") === "on",
        quarterly_hour_utc: Number(formData.get("quarterlyHour") ?? 10),
        auto_email_enabled: formData.get("autoEmail") === "on",
        recipients,
        primary_color: String(formData.get("primaryColor") ?? "#0f766e"),
        secondary_color: String(formData.get("secondaryColor") ?? "#134e4a"),
        logo_url: String(formData.get("logoUrl") ?? "").trim() || null,
      })
      .eq("brand_id", brandId)
      .eq("organization_id", active.organization_id);

    if (error) return { error: error.message };
    revalidatePath("/reviews/settings");
    revalidatePath("/reviews/kpis");
    return { success: "Report settings saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function upsertBrandKpi(
  _prev: ReviewsActionResult,
  formData: FormData,
): Promise<ReviewsActionResult> {
  try {
    const { active } = await assertCanWrite();
    const brandId = String(formData.get("brandId") ?? "");
    const metricKey = String(formData.get("metricKey") ?? "").trim();
    const label = String(formData.get("label") ?? "").trim();
    if (!brandId || !metricKey || !label) {
      return { error: "Brand, metric key, and label are required" };
    }

    const supabase = await createClient();
    const kpiId = String(formData.get("kpiId") ?? "");
    const payload = {
      organization_id: active.organization_id,
      brand_id: brandId,
      metric_key: metricKey,
      label,
      target_value: Number(formData.get("targetValue") ?? 0),
      unit: String(formData.get("unit") ?? ""),
      channel: String(formData.get("channel") ?? "").trim() || null,
      is_north_star: formData.get("isNorthStar") === "on",
      sort_order: Number(formData.get("sortOrder") ?? 0),
    };

    if (kpiId) {
      const { error } = await supabase
        .from("brand_kpis")
        .update(payload)
        .eq("id", kpiId)
        .eq("organization_id", active.organization_id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase.from("brand_kpis").upsert(payload, {
        onConflict: "brand_id,metric_key",
      });
      if (error) return { error: error.message };
    }

    revalidatePath("/reviews/kpis");
    return { success: "KPI saved" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}

export async function deleteBrandKpi(formData: FormData) {
  const { active } = await assertCanWrite();
  const kpiId = String(formData.get("kpiId") ?? "");
  const supabase = await createClient();
  await supabase
    .from("brand_kpis")
    .delete()
    .eq("id", kpiId)
    .eq("organization_id", active.organization_id);
  revalidatePath("/reviews/kpis");
}

export async function sendReportEmail(
  _prev: ReviewsActionResult,
  formData: FormData,
): Promise<ReviewsActionResult> {
  try {
    const { active } = await assertCanWrite();
    const reportId = String(formData.get("reportId") ?? "");
    const recipients = String(formData.get("recipients") ?? "")
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!reportId || !recipients.length) {
      return { error: "Report and recipients required" };
    }

    const supabase = await createClient();
    const { data: report } = await supabase
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .eq("organization_id", active.organization_id)
      .single();
    if (!report || report.status !== "complete") {
      return { error: "Report not ready" };
    }

    const r = report as Report;
    const sent = await emailReport({
      report: r,
      content: r.content as ReportContent,
      recipients,
    });
    const merged = [...new Set([...(r.sent_to ?? []), ...sent])];
    await supabase
      .from("reports")
      .update({ sent_to: merged })
      .eq("id", reportId);

    revalidatePath(`/reviews/${reportId}`);
    return {
      success: sent.length
        ? `Emailed ${sent.length} recipient(s)`
        : "No emails sent (check RESEND config)",
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed" };
  }
}
