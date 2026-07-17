import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  marketingPlanDocumentSchema,
  marketingPlannerPrompt,
} from "@/lib/agents/prompts/planning/planner";
import type { BrandContext } from "@/lib/brand/context";
import type { MarketingPlanPeriod } from "@/lib/types/planning";

export async function generateMarketingPlan(input: {
  brandContext: BrandContext;
  goalBrief: string;
  periodType: MarketingPlanPeriod;
  periodStart: string;
  periodEnd: string;
  budgetPence?: number | null;
  currency?: string;
  performanceMarkdown?: string;
  researchMarkdown?: string;
  model?: string;
}) {
  return runClaudeJson({
    system: marketingPlannerPrompt.system,
    user: `${input.brandContext.markdown}

${input.researchMarkdown ? `## Research\n${input.researchMarkdown}\n` : ""}
${input.performanceMarkdown ? `## Past performance\n${input.performanceMarkdown}\n` : ""}

## Goal
${input.goalBrief}

Period: ${input.periodType} from ${input.periodStart} to ${input.periodEnd}
Budget: ${input.budgetPence ?? "not specified"} pence (${input.currency ?? "GBP"})

Return JSON matching: summary, objectives[], strategies[], campaigns[], channel_tactics[], budget_split[], kpi_targets[], task_breakdown[].
Campaign keys must be unique slugs. Task campaign_key must match a campaign key.`,
    schema: marketingPlanDocumentSchema,
    model: input.model,
    maxTokens: 8000,
  });
}
