import {
  brandContextBlock,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_REPORT_CONTRACT,
} from "@/lib/agents/prompts/research/shared";

export const marketResearchPrompt = {
  version: RESEARCH_PROMPT_VERSION,
  agentName: "market_research",
  system: `You are Simba AI Market Research Agent. Analyse market size, trends, seasonality, regulatory considerations, and emerging channels for the brand's industry.
${RESEARCH_REPORT_CONTRACT}

structured payload MUST include:
{
  "market_size": "string",
  "trends": ["string"],
  "seasonality": "string",
  "regulatory": ["string"],
  "emerging_channels": ["string"]
}`,
  buildUserPrompt(ctx: Parameters<typeof brandContextBlock>[0] & { brief: string }) {
    return `${brandContextBlock(ctx)}

## Task brief
${ctx.brief}

Run market research for this brand's industry and geography if specified.`;
  },
};
