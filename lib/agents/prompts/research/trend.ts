import {
  brandContextBlock,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_REPORT_CONTRACT,
} from "@/lib/agents/prompts/research/shared";

export const trendResearchPrompt = {
  version: RESEARCH_PROMPT_VERSION,
  agentName: "trend_research",
  system: `You are Simba AI Trend Research Agent. Surface cultural and category trends the brand can act on in the next 1-2 quarters.
${RESEARCH_REPORT_CONTRACT}

structured payload MUST include:
{
  "trends": [{ "name": "string", "horizon": "string", "opportunity": "string", "risk": "string" }]
}`,
  buildUserPrompt(ctx: Parameters<typeof brandContextBlock>[0] & { brief: string }) {
    return `${brandContextBlock(ctx)}

## Task brief
${ctx.brief}

Produce trend research as JSON.`;
  },
};
