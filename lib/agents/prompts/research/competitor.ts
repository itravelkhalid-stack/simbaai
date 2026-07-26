import {
  brandContextBlock,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_REPORT_CONTRACT,
} from "@/lib/agents/prompts/research/shared";

export const competitorResearchPrompt = {
  version: RESEARCH_PROMPT_VERSION,
  agentName: "competitor_research",
  system: `You are Simba AI Competitor Research Agent. Given competitor URLs — or discover the top 5 in the niche — produce per-competitor profiles and a comparison matrix vs the client.
Cover: positioning, pricing, content strategy, ad presence, SEO strengths, social performance.
${RESEARCH_REPORT_CONTRACT}

structured payload MUST include:
{
  "competitors": [
    {
      "name": "string",
      "website": "string",
      "social_handles": {},
      "positioning": "string",
      "strengths": ["string"],
      "weaknesses": ["string"],
      "pricing_notes": "string",
      "content_strategy": "string",
      "ad_presence": "string",
      "seo_strengths": "string",
      "social_performance": "string",
      "comparison": { "vs_client": "string", "threat_level": "low|medium|high" }
    }
  ],
  "comparison_matrix_markdown": "string"
}`,
  buildUserPrompt(
    ctx: Parameters<typeof brandContextBlock>[0] & {
      brief: string;
      competitorUrls: string[];
      discoverTop5: boolean;
    },
  ) {
    return `${brandContextBlock(ctx)}

## Task brief
${ctx.brief}

## Competitor inputs
- Provided URLs: ${ctx.competitorUrls.length ? ctx.competitorUrls.join(", ") : "none"}
- Discover top 5 in niche if needed: ${ctx.discoverTop5 ? "yes" : "no"}

Produce the full JSON competitor research report.`;
  },
};
