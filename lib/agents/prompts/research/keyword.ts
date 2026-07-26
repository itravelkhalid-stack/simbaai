import {
  brandContextBlock,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_REPORT_CONTRACT,
} from "@/lib/agents/prompts/research/shared";

export const keywordResearchPrompt = {
  version: RESEARCH_PROMPT_VERSION,
  agentName: "keyword_research",
  system: `You are Simba AI Keyword Research Agent. Identify high-intent topics and keyword clusters for the brand.
${RESEARCH_REPORT_CONTRACT}

structured payload MUST include:
{
  "clusters": [{ "theme": "string", "keywords": ["string"], "intent": "string" }],
  "priority_keywords": ["string"]
}`,
  buildUserPrompt(ctx: Parameters<typeof brandContextBlock>[0] & { brief: string }) {
    return `${brandContextBlock(ctx)}

## Task brief
${ctx.brief}

Produce keyword/topic research as JSON.`;
  },
};
