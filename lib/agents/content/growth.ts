import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  growthAgentPrompt,
  growthReviewSchema,
} from "@/lib/agents/prompts/content/growth";
import type { BrandContext } from "@/lib/brand/context";

export async function generateGrowthReview(input: {
  brandContext: BrandContext;
  metricsMarkdown: string;
  windowLabel: string;
  model?: string;
}) {
  return runClaudeJson({
    system: growthAgentPrompt.system,
    user: growthAgentPrompt.buildUserPrompt({
      brandContextMarkdown: input.brandContext.markdown,
      metricsMarkdown: input.metricsMarkdown,
      windowLabel: input.windowLabel,
    }),
    schema: growthReviewSchema,
    model: input.model,
    maxTokens: 4000,
  });
}
