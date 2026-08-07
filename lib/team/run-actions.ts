"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAgentById } from "@/lib/agents/registry";
import { runDailyOptimisationForOrg } from "@/lib/ads/optimisation";
import { syncAllManagedCampaignMetrics } from "@/lib/ads/metrics";
import { assertPlanAllows } from "@/lib/billing/plans";
import { actionErrorFromUnknown } from "@/lib/billing/action-error";
import { runWeeklyGrowthReviewForBrand } from "@/lib/content/growth";
import { runWeeklyPipelineReviews } from "@/lib/crm/pipeline-review";
import { buildAnalyticsDailyRollups } from "@/lib/data/rollups";
import { runWeeklyFinanceAnalyst } from "@/lib/finance/analyst";
import { runDailyFinanceIngestion } from "@/lib/finance/ingest";
import { inngest } from "@/lib/inngest/client";
import { createAndQueueMeeting } from "@/lib/meetings/run";
import { requireActiveOrg } from "@/lib/org/require";
import { createAndQueueReport } from "@/lib/reviews/run";
import { generateWeeklySummariesForAll } from "@/lib/seo/jobs";
import { createClient } from "@/lib/supabase/server";

export type TeamActionResult = {
  error?: string;
  upgradeHref?: string;
  success?: string;
};

async function assertCanWrite() {
  const ctx = await requireActiveOrg();
  if (ctx.active.role === "org_viewer") {
    throw new Error("Viewers cannot run agents");
  }
  return ctx;
}

const runNowSchema = z.object({
  agentId: z.string().min(1),
  brandId: z.string().uuid().optional(),
});

export async function runAgentNow(
  _prev: TeamActionResult,
  formData: FormData,
): Promise<TeamActionResult> {
  try {
    const { active } = await assertCanWrite();
    await assertPlanAllows(active.organization_id, "ai_runs_month");

    const parsed = runNowSchema.safeParse({
      agentId: formData.get("agentId"),
      brandId: formData.get("brandId") || undefined,
    });
    if (!parsed.success) return { error: "Invalid request" };

    const entry = getAgentById(parsed.data.agentId);
    if (!entry?.runNow) {
      return { error: "This agent cannot be run on demand from Team" };
    }

    const brandId = parsed.data.brandId;
    if (entry.runNow.requiresBrand && !brandId) {
      return { error: "Select a brand" };
    }

    const kind = entry.runNow.kind;

    if (kind === "meeting" && brandId && entry.runNow.type) {
      const meeting = await createAndQueueMeeting({
        organizationId: active.organization_id,
        brandId,
        type: entry.runNow.type as
          | "daily_standup"
          | "weekly_marketing"
          | "monthly_board"
          | "quarterly_board"
          | "annual_review",
      });
      await inngest.send({
        name: "meetings/run",
        data: { meetingId: meeting.id },
      });
      revalidatePath("/team");
      revalidatePath("/meetings");
      return { success: `Queued ${entry.displayName}` };
    }

    if (kind === "report" && brandId && entry.runNow.type) {
      const report = await createAndQueueReport({
        organizationId: active.organization_id,
        brandId,
        type: entry.runNow.type as "daily" | "weekly" | "monthly" | "quarterly",
      });
      await inngest.send({
        name: "reviews/run",
        data: { reportId: report.id },
      });
      revalidatePath("/team");
      revalidatePath("/reviews");
      return { success: `Queued ${entry.displayName}` };
    }

    if (kind === "ads_optimisation") {
      const result = await runDailyOptimisationForOrg(active.organization_id);
      revalidatePath("/team");
      revalidatePath("/ads/recommendations");
      return {
        success: `Optimisation complete (${result.recommendations ?? 0} recommendations)`,
      };
    }

    if (kind === "ads_sync_metrics") {
      await inngest.send({
        name: "ads/metrics.sync",
        data: { organizationId: active.organization_id },
      });
      // Also sync directly for snappy UI feedback
      await syncAllManagedCampaignMetrics(50);
      revalidatePath("/team");
      revalidatePath("/ads");
      return { success: "Ad metrics sync queued" };
    }

    if (kind === "organic_growth" && brandId) {
      const supabase = await createClient();
      const { data: brand } = await supabase
        .from("brands")
        .select("id, organization_id")
        .eq("id", brandId)
        .eq("organization_id", active.organization_id)
        .single();
      if (!brand) return { error: "Brand not found" };
      await runWeeklyGrowthReviewForBrand({
        organizationId: active.organization_id,
        brandId,
      });
      revalidatePath("/team");
      revalidatePath("/content");
      return { success: "Organic growth review complete" };
    }

    if (kind === "content_cadence_fill") {
      await inngest.send({
        name: "content/cadence.fill",
        data: {
          organizationId: active.organization_id,
          brandId: brandId ?? null,
        },
      });
      revalidatePath("/team");
      revalidatePath("/content/calendar");
      return { success: "Cadence fill queued (runs across brands)" };
    }

    if (kind === "ceo_check" && brandId) {
      await inngest.send({
        name: "ceo/check.run",
        data: {
          organizationId: active.organization_id,
          brandId,
          weekly: false,
        },
      });
      revalidatePath("/team");
      revalidatePath("/meetings");
      return { success: "CEO check queued" };
    }

    if (kind === "finance_ingest") {
      const result = await runDailyFinanceIngestion();
      revalidatePath("/team");
      revalidatePath("/finance");
      return {
        success: `Ingested ads ${result.ads.inserted}, platform ${result.platform.inserted}, revenue ${result.revenue.inserted}`,
      };
    }

    if (kind === "finance_analyst") {
      await runWeeklyFinanceAnalyst();
      revalidatePath("/team");
      revalidatePath("/finance");
      return { success: "Finance analyst run complete" };
    }

    if (kind === "pipeline_review") {
      await runWeeklyPipelineReviews();
      revalidatePath("/team");
      revalidatePath("/crm");
      return { success: "Pipeline review run complete" };
    }

    if (kind === "analytics_rollup") {
      await buildAnalyticsDailyRollups(14);
      await inngest.send({
        name: "analytics/rollup.run",
        data: { daysBack: 14 },
      });
      revalidatePath("/team");
      revalidatePath("/data");
      return { success: "Analytics rollup complete" };
    }

    if (kind === "seo_weekly_summary") {
      await generateWeeklySummariesForAll();
      revalidatePath("/team");
      revalidatePath("/seo");
      return { success: "SEO weekly summaries complete" };
    }

    return { error: "Unsupported run kind" };
  } catch (error) {
    return actionErrorFromUnknown(error, "Failed to run agent");
  }
}
