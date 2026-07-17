import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  adsCreativePrompt,
  adsOptimisationPrompt,
  adsStrategistPrompt,
  creativeVariantsSchema,
  mediaPlanSchema,
  optimisationSchema,
} from "@/lib/agents/prompts/ads/strategist";
import type { BrandContext } from "@/lib/brand/context";
import type { AdPlatform } from "@/lib/types/ads";

export async function generateMediaPlan(input: {
  brandContext: BrandContext;
  goalBrief: string;
  monthlyBudgetPence: number;
  currency: string;
  targetRoas?: number | null;
  objective?: string;
  researchMarkdown?: string;
  model?: string;
}) {
  const result = await runClaudeJson({
    system: adsStrategistPrompt.system,
    user: `${input.brandContext.markdown}

${input.researchMarkdown ? `## Research\n${input.researchMarkdown}\n` : ""}

## Goal
${input.goalBrief}

Monthly budget: ${input.monthlyBudgetPence} pence (${input.currency})
Target ROAS: ${input.targetRoas ?? "not set"}
Objective: ${input.objective ?? "purchases"}

Return JSON:
{
  "name": string,
  "summary": string,
  "platform_split": [{ "platform": "meta"|"tiktok"|"google"|"x"|"bing", "budget_pct": number, "rationale": string }],
  "funnel_stages": [{ "stage": string, "budget_pct": number, "goal": string }],
  "campaigns": [{
    "name": string,
    "platform": "meta"|"tiktok"|"google"|"x"|"bing",
    "objective": string,
    "funnel_stage": string,
    "daily_budget_pence": number,
    "audience": string,
    "targeting_notes": string,
    "creative_requirements": string[]
  }],
  "creative_brief": string,
  "risks": string[]
}`,
    schema: mediaPlanSchema,
    model: input.model,
    maxTokens: 5000,
  });
  return result;
}

export async function generateAdCreatives(input: {
  brandContext: BrandContext;
  platform: AdPlatform;
  campaignName: string;
  objective?: string | null;
  creativeBrief: string;
  variantCount?: number;
  model?: string;
}) {
  const count = input.variantCount ?? 3;
  const result = await runClaudeJson({
    system: adsCreativePrompt.system,
    user: `${input.brandContext.markdown}

## Campaign
Platform: ${input.platform}
Name: ${input.campaignName}
Objective: ${input.objective ?? "conversions"}
Creative brief: ${input.creativeBrief}

Generate ${count} variants as JSON:
{
  "variants": [{
    "variant_label": string,
    "format": string,
    "headline": string,
    "primary_text": string,
    "description": string,
    "cta": string,
    "hook": string
  }]
}`,
    schema: creativeVariantsSchema,
    model: input.model,
    maxTokens: 3000,
  });
  return result;
}

export async function generateOptimisationRecommendations(input: {
  brandContext: BrandContext;
  performanceMarkdown: string;
  model?: string;
}) {
  const result = await runClaudeJson({
    system: adsOptimisationPrompt.system,
    user: `${input.brandContext.markdown}

## Performance snapshot
${input.performanceMarkdown}

Return JSON:
{
  "recommendations": [{
    "recommendation_type": "pause_campaign"|"activate_campaign"|"shift_budget"|"refresh_creative"|"adjust_targeting"|"other",
    "title": string,
    "rationale": string,
    "campaign_name": string,
    "payload": {}
  }]
}`,
    schema: optimisationSchema,
    model: input.model,
    maxTokens: 3000,
  });
  return result;
}
