export const RESEARCH_PROMPT_VERSION = "research-v1";

export const RESEARCH_REPORT_CONTRACT = `
You MUST return a single JSON object (no markdown fences) matching this shape:
{
  "executive_summary": "string (2-4 paragraphs)",
  "recommended_actions": ["string", "..."],
  "sections": [
    {
      "section": "string (slug or title)",
      "content": "string (markdown)",
      "confidence": 0.0-1.0,
      "sources": [{ "title": "string", "url": "string", "note": "string?" }]
    }
  ],
  "structured": { } // agent-specific payload described in the task prompt
}

Rules:
- Always include executive_summary and recommended_actions (Planning consumes these later).
- Use web search for current, cited evidence. Prefer primary sources.
- Write section content as markdown with clear headings.
- confidence is your calibrated certainty for that section (0-1).
- Do not invent URLs. If a claim is inferred, say so and lower confidence.
`;

export function brandContextBlock(input: {
  organizationName: string;
  brandName: string;
  website?: string | null;
  positioning?: string | null;
  brandVoice?: string | null;
  targetAudience?: string | null;
  socialHandles?: Record<string, unknown> | null;
  priorResearchMarkdown?: string | null;
}) {
  return `
## Organization / brand context
- Organization: ${input.organizationName}
- Brand: ${input.brandName}
- Website: ${input.website ?? "unknown"}
- Positioning: ${input.positioning ?? "not set"}
- Brand voice: ${input.brandVoice ?? "not set"}
- Target audience: ${input.targetAudience ?? "not set"}
- Social handles: ${JSON.stringify(input.socialHandles ?? {})}

## Prior research context (if refreshing)
${input.priorResearchMarkdown?.trim() || "None provided."}
`.trim();
}
