import {
  brandContextBlock,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_REPORT_CONTRACT,
} from "@/lib/agents/prompts/research/shared";

export const audienceResearchPrompt = {
  version: RESEARCH_PROMPT_VERSION,
  agentName: "audience_research",
  system: `You are GrowthOS Audience Research Agent. Validate and expand the brand's personas with channel behaviour and messaging angles per persona.
${RESEARCH_REPORT_CONTRACT}

structured payload MUST include:
{
  "personas": [
    {
      "name": "string",
      "description": "string",
      "demographics": {},
      "psychographics": {},
      "channel_behaviour": {},
      "messaging_angles": ["string"]
    }
  ]
}`,
  buildUserPrompt(ctx: Parameters<typeof brandContextBlock>[0] & { brief: string }) {
    return `${brandContextBlock(ctx)}

## Task brief
${ctx.brief}

Validate/expand audience personas with evidence from public sources and category norms.`;
  },
};
