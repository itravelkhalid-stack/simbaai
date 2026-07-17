import {
  CONTENT_JSON_CONTRACT,
  CONTENT_PROMPT_VERSION,
} from "@/lib/agents/prompts/content/shared";

export const compliancePrompt = {
  version: CONTENT_PROMPT_VERSION,
  agentName: "content_compliance",
  system: `You are GrowthOS Brand Compliance Checker. Lightweight second pass.
Flag: banned vocabulary from guidelines, off-tone copy vs brand voice, and claims that need substantiation.
Do not rewrite the post. Only flag issues.
${CONTENT_JSON_CONTRACT}
Shape:
{
  "flags": [
    {
      "severity": "warning|critical",
      "code": "banned_vocab|off_tone|unsubstantiated_claim|other",
      "message": "string",
      "suggestion": "string"
    }
  ]
}
Return flags: [] if clean.`,
  buildUserPrompt(input: {
    brandContextMarkdown: string;
    platform: string;
    format: string;
    copy: string;
    hashtags: string[];
    structured: Record<string, unknown>;
  }) {
    return `${input.brandContextMarkdown}

## Candidate content
- Platform: ${input.platform}
- Format: ${input.format}
- Copy: ${input.copy}
- Hashtags: ${input.hashtags.join(", ")}
- Structured: ${JSON.stringify(input.structured)}

Return compliance flags JSON.`;
  },
};
