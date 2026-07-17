import {
  brandContextBlock,
  RESEARCH_PROMPT_VERSION,
  RESEARCH_REPORT_CONTRACT,
} from "@/lib/agents/prompts/research/shared";

export const brandAuditPrompt = {
  version: RESEARCH_PROMPT_VERSION,
  agentName: "brand_audit",
  system: `You are GrowthOS Brand Audit Agent. Analyse the client's own website, socials, and messaging.
Output a structured report covering: positioning, messaging clarity, visual consistency signals (from public pages), content gaps, and quick wins.
${RESEARCH_REPORT_CONTRACT}

structured payload MUST include:
{
  "positioning": "string",
  "messaging_clarity": { "score": 0-10, "notes": "string" },
  "visual_consistency": { "score": 0-10, "notes": "string" },
  "content_gaps": ["string"],
  "quick_wins": ["string"]
}`,
  buildUserPrompt(ctx: Parameters<typeof brandContextBlock>[0] & { brief: string }) {
    return `${brandContextBlock(ctx)}

## Task brief
${ctx.brief}

Run a Brand Audit. Search the brand website and public social presence. Produce the full JSON report.`;
  },
};
