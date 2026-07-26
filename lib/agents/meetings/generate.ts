import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  annualReviewPrompt,
  annualReviewSchema,
  boardMeetingPrompt,
  boardMeetingSchema,
  dailyStandupPrompt,
  standupMeetingSchema,
  weeklyMarketingPrompt,
  weeklyMeetingSchema,
} from "@/lib/agents/prompts/meetings/meetings";
import type { MeetingPeriodContext } from "@/lib/meetings/context";
import type { MeetingType } from "@/lib/types/meetings";

export async function generateDailyStandup(ctx: MeetingPeriodContext) {
  return runClaudeJson({
    system: dailyStandupPrompt.system,
    user: `${ctx.brandMarkdown}

## Cross-module data
${ctx.markdown}

Produce a daily standup JSON for brand "${ctx.brandName}".`,
    schema: standupMeetingSchema,
    maxTokens: 4096,
  });
}

export async function generateWeeklyMarketingMeeting(ctx: MeetingPeriodContext) {
  return runClaudeJson({
    system: weeklyMarketingPrompt.system,
    user: `${ctx.brandMarkdown}

## Cross-channel performance (${ctx.periodLabel})
${ctx.markdown}

Produce a weekly marketing meeting JSON for brand "${ctx.brandName}".`,
    schema: weeklyMeetingSchema,
    maxTokens: 8000,
  });
}

export async function generateBoardMeeting(
  ctx: MeetingPeriodContext,
  type: "monthly_board" | "quarterly_board",
) {
  return runClaudeJson({
    system: boardMeetingPrompt.system,
    user: `${ctx.brandMarkdown}

## Board pack data (${ctx.periodLabel}) — ${type}
${ctx.markdown}

Spend and revenue figures in the data are authoritative (pence). Align pnl with them unless explaining a material adjustment.
Produce a ${type === "quarterly_board" ? "quarterly" : "monthly"} board meeting JSON for brand "${ctx.brandName}".`,
    schema: boardMeetingSchema,
    maxTokens: 10000,
  });
}

export async function generateAnnualReview(ctx: MeetingPeriodContext) {
  return runClaudeJson({
    system: annualReviewPrompt.system,
    user: `${ctx.brandMarkdown}

## Annual review data (${ctx.periodLabel})
${ctx.markdown}

Produce an annual review JSON for brand "${ctx.brandName}".`,
    schema: annualReviewSchema,
    maxTokens: 12000,
  });
}

export async function generateMeetingForType(
  type: MeetingType,
  ctx: MeetingPeriodContext,
) {
  if (type === "daily_standup") return generateDailyStandup(ctx);
  if (type === "weekly_marketing") return generateWeeklyMarketingMeeting(ctx);
  if (type === "monthly_board" || type === "quarterly_board") {
    return generateBoardMeeting(ctx, type);
  }
  if (type === "annual_review") return generateAnnualReview(ctx);
  return generateWeeklyMarketingMeeting(ctx);
}
