import { createAdminClient } from "@/lib/supabase/admin";
import { generateReportContent } from "@/lib/agents/reviews/generate";
import { gatherReportMetrics } from "@/lib/reviews/metrics";
import { getOrCreateBrandReportSettings } from "@/lib/reviews/periods";
import { buildReportPdfBuffer, uploadReportPdf } from "@/lib/reviews/pdf";
import { emailReport } from "@/lib/reviews/email";
import type { Report, ReportType } from "@/lib/types/reviews";
import { REPORT_TYPE_LABELS } from "@/lib/types/reviews";
import { periodForReportType } from "@/lib/reviews/periods";

function previousWindow(periodStart: string, periodEnd: string) {
  const start = new Date(`${periodStart}T12:00:00Z`);
  const end = new Date(`${periodEnd}T12:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevStart.getUTCDate() - (days - 1));
  return {
    previousStart: prevStart.toISOString().slice(0, 10),
    previousEnd: prevEnd.toISOString().slice(0, 10),
  };
}

export async function createAndQueueReport(params: {
  organizationId: string;
  brandId: string;
  type: ReportType;
  asOf?: Date;
}) {
  const supabase = createAdminClient();
  const period = periodForReportType(params.type, params.asOf ?? new Date());
  const title = `${REPORT_TYPE_LABELS[params.type]} report · ${period.periodStart} → ${period.periodEnd}`;

  const { data, error } = await supabase
    .from("reports")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      type: params.type,
      title,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      status: "scheduled",
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create report");
  return data as Report;
}

export async function runReport(reportId: string) {
  const supabase = createAdminClient();
  const { data: report, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .single();
  if (error || !report) throw new Error(error?.message ?? "Report not found");
  const r = report as Report;
  if (r.status === "complete") return { reportId, skipped: true as const };

  const { skipIfBrandAgentHalted } = await import("@/lib/brand/agent-halt");
  const halt = await skipIfBrandAgentHalted({
    organizationId: r.organization_id,
    brandId: r.brand_id,
  });
  if (halt) {
    await supabase
      .from("reports")
      .update({
        status: "cancelled",
        error: halt.message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", reportId);
    return { reportId, ...halt };
  }

  await supabase
    .from("reports")
    .update({
      status: "generating",
      started_at: new Date().toISOString(),
      error: null,
    })
    .eq("id", reportId);

  const { data: agentRun } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: r.organization_id,
      module: "reviews",
      agent_name: `report_${r.type}`,
      status: "running",
      input: { report_id: reportId, type: r.type, brand_id: r.brand_id },
      progress: 10,
    })
    .select("id")
    .single();

  try {
    const settings = await getOrCreateBrandReportSettings(
      r.organization_id,
      r.brand_id,
    );
    const prev = previousWindow(r.period_start, r.period_end);

    const bundle = await gatherReportMetrics({
      organizationId: r.organization_id,
      brandId: r.brand_id,
      type: r.type,
      period: {
        periodStart: r.period_start,
        periodEnd: r.period_end,
        previousStart: prev.previousStart,
        previousEnd: prev.previousEnd,
      },
    });

    const generated = await generateReportContent(bundle, r.type);
    const content = {
      ...generated.data,
      branding: {
        primary_color: settings.primary_color,
        secondary_color: settings.secondary_color,
        logo_url: settings.logo_url,
        brand_name: bundle.brandName,
      },
      series: bundle.series,
    };

    const pdfBuffer = await buildReportPdfBuffer({ report: r, content });
    const pdfUrl = await uploadReportPdf({
      organizationId: r.organization_id,
      reportId,
      buffer: pdfBuffer,
    });

    let sentTo: string[] = [];
    if (settings.auto_email_enabled && settings.recipients.length) {
      sentTo = await emailReport({
        report: { ...r, pdf_url: pdfUrl },
        content,
        recipients: settings.recipients,
      });
    }

    await supabase
      .from("reports")
      .update({
        status: "complete",
        title: content.title || r.title,
        content,
        pdf_url: pdfUrl,
        sent_to: sentTo,
        agent_run_id: agentRun?.id ?? null,
        completed_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", reportId);

    try {
      const { emitAutomationEvent } = await import("@/lib/automations/runner");
      await emitAutomationEvent({
        organizationId: r.organization_id,
        brandId: r.brand_id,
        event: "report.ready",
        data: { report_id: reportId, title: content.title || r.title },
      });
    } catch {
      // non-blocking
    }

    try {
      const { notifyOrgAdmins } = await import("@/lib/notifications/notify");
      await notifyOrgAdmins({
        organizationId: r.organization_id,
        title: `Report ready: ${content.title || r.title}`,
        body: "Your brand report is ready to review.",
        link: `/reviews/${reportId}`,
        category: "reports",
      });
    } catch {
      // non-blocking
    }

    if (agentRun?.id) {
      await supabase
        .from("agent_runs")
        .update({
          status: "complete",
          output: {
            title: content.title,
            headlines: content.headline_numbers.length,
            emailed: sentTo.length,
          },
          tokens_in: generated.tokensIn,
          tokens_out: generated.tokensOut,
          cost_pence: generated.costPence,
          progress: 100,
        })
        .eq("id", agentRun.id);
    }

    return { reportId, skipped: false as const, pdfUrl, sentTo };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Report failed";
    await supabase
      .from("reports")
      .update({
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", reportId);
    if (agentRun?.id) {
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: message, progress: 100 })
        .eq("id", agentRun.id);
    }
    throw err;
  }
}
