import {
  CONTENT_JSON_CONTRACT,
  CONTENT_PROMPT_VERSION,
  PLATFORM_RULES,
} from "@/lib/agents/prompts/content/shared";

export const singlePostPrompt = {
  version: CONTENT_PROMPT_VERSION,
  agentName: "content_single_post",
  system: `You are Simba AI Content Agent. Write platform-native social copy that matches the brand context exactly.
${PLATFORM_RULES}
${CONTENT_JSON_CONTRACT}
Shape:
{
  "variants": [
    {
      "label": "A|B|C",
      "title": "string",
      "copy": "string",
      "hashtags": ["string"],
      "structured": {},
      "rationale": "string"
    }
  ]
}
Always return exactly 3 variants with meaningfully different hooks/angles.
When format is "story", write short (under 80 characters) visual-first copy suitable for Instagram Stories — no long paragraphs, minimal hashtags.`,
  buildUserPrompt(input: {
    brandContextMarkdown: string;
    platform: string;
    format: string;
    pillarName?: string | null;
    topic: string;
    rejectionReason?: string | null;
  }) {
    return `${input.brandContextMarkdown}

## Request
- Platform: ${input.platform}
- Format: ${input.format}
- Pillar: ${input.pillarName ?? "unspecified"}
- Topic / brief: ${input.topic}
${input.rejectionReason ? `- Prior rejection feedback to address: ${input.rejectionReason}` : ""}

Produce 3 variant drafts as JSON.`;
  },
};
