import { singlePostPrompt } from "@/lib/agents/prompts/content/single-post";
import { batchPlanPrompt } from "@/lib/agents/prompts/content/batch-plan";
import { repurposePrompt } from "@/lib/agents/prompts/content/repurpose";
import { scriptPrompt } from "@/lib/agents/prompts/content/script";
import { compliancePrompt } from "@/lib/agents/prompts/content/compliance";
import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  batchPlanResultSchema,
  complianceResultSchema,
  repurposeResultSchema,
  scriptResultSchema,
  singlePostResultSchema,
} from "@/lib/validations/content";
import type { BrandContext } from "@/lib/brand/context";
import type {
  ComplianceFlag,
  ContentFormat,
  ContentPlatform,
} from "@/lib/types/content";

export async function generateSinglePostVariants(input: {
  brandContext: BrandContext;
  platform: ContentPlatform;
  format: ContentFormat;
  pillarName?: string | null;
  topic: string;
  rejectionReason?: string | null;
  model?: string;
}) {
  return runClaudeJson({
    system: singlePostPrompt.system,
    user: singlePostPrompt.buildUserPrompt({
      brandContextMarkdown: input.brandContext.markdown,
      platform: input.platform,
      format: input.format,
      pillarName: input.pillarName,
      topic: input.topic,
      rejectionReason: input.rejectionReason,
    }),
    schema: singlePostResultSchema,
    model: input.model,
    maxTokens: 5000,
  });
}

export async function generateScriptContent(input: {
  brandContext: BrandContext;
  platform: ContentPlatform;
  format: ContentFormat;
  pillarName?: string | null;
  topic: string;
  rejectionReason?: string | null;
  model?: string;
}) {
  return runClaudeJson({
    system: scriptPrompt.system,
    user: scriptPrompt.buildUserPrompt({
      brandContextMarkdown: input.brandContext.markdown,
      platform: input.platform,
      format: input.format,
      pillarName: input.pillarName,
      topic: input.topic,
      rejectionReason: input.rejectionReason,
    }),
    schema: scriptResultSchema,
    model: input.model,
    maxTokens: 5000,
  });
}

export async function generateBatchPlan(input: {
  brandContext: BrandContext;
  startDate: string;
  endDate: string;
  brief: string;
  model?: string;
}) {
  return runClaudeJson({
    system: batchPlanPrompt.system,
    user: batchPlanPrompt.buildUserPrompt({
      brandContextMarkdown: input.brandContext.markdown,
      startDate: input.startDate,
      endDate: input.endDate,
      brief: input.brief,
      pillars: input.brandContext.pillars.map((p) => ({
        name: p.name,
        target_pct: Number(p.target_pct),
      })),
    }),
    schema: batchPlanResultSchema,
    model: input.model,
    maxTokens: 5000,
  });
}

export async function generateRepurposeAdaptations(input: {
  brandContext: BrandContext;
  sourcePlatform: ContentPlatform;
  sourceFormat: ContentFormat;
  sourceCopy: string;
  sourceHashtags: string[];
  sourceStructured: Record<string, unknown>;
  targetPlatforms: ContentPlatform[];
  model?: string;
}) {
  return runClaudeJson({
    system: repurposePrompt.system,
    user: repurposePrompt.buildUserPrompt({
      brandContextMarkdown: input.brandContext.markdown,
      sourcePlatform: input.sourcePlatform,
      sourceFormat: input.sourceFormat,
      sourceCopy: input.sourceCopy,
      sourceHashtags: input.sourceHashtags,
      sourceStructured: input.sourceStructured,
      targetPlatforms: input.targetPlatforms,
    }),
    schema: repurposeResultSchema,
    model: input.model,
    maxTokens: 6000,
  });
}

export async function runComplianceCheck(input: {
  brandContext: BrandContext;
  platform: ContentPlatform;
  format: ContentFormat;
  copy: string;
  hashtags: string[];
  structured: Record<string, unknown>;
  model?: string;
}): Promise<{
  flags: ComplianceFlag[];
  tokensIn: number;
  tokensOut: number;
  costPence: number;
  model: string;
}> {
  const result = await runClaudeJson({
    system: compliancePrompt.system,
    user: compliancePrompt.buildUserPrompt({
      brandContextMarkdown: input.brandContext.markdown,
      platform: input.platform,
      format: input.format,
      copy: input.copy,
      hashtags: input.hashtags,
      structured: input.structured,
    }),
    schema: complianceResultSchema,
    model: input.model || "claude-sonnet-4-6",
    maxTokens: 1500,
  });

  return {
    flags: result.data.flags,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costPence: result.costPence,
    model: result.model,
  };
}

export function isScriptFormat(format: ContentFormat) {
  return (
    format === "carousel" ||
    format === "reel_script" ||
    format === "short_script"
  );
}
