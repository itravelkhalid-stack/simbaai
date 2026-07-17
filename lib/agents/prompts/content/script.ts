import {
  CONTENT_JSON_CONTRACT,
  CONTENT_PROMPT_VERSION,
  PLATFORM_RULES,
} from "@/lib/agents/prompts/content/shared";

export const scriptPrompt = {
  version: CONTENT_PROMPT_VERSION,
  agentName: "content_script",
  system: `You are GrowthOS Script Agent. Produce carousel slide-by-slide or reel/short shot-by-shot scripts.
${PLATFORM_RULES}
${CONTENT_JSON_CONTRACT}
For carousel:
{
  "title": "string",
  "caption": "string",
  "hashtags": ["string"],
  "structured": {
    "slides": [
      { "slide": 1, "on_screen_text": "string", "visual": "string", "notes": "string" }
    ]
  }
}
For reel_script / short_script:
{
  "title": "string",
  "caption": "string",
  "hashtags": ["string"],
  "structured": {
    "shots": [
      {
        "shot": 1,
        "duration_sec": 2,
        "on_screen_text": "string",
        "voiceover": "string",
        "visual": "string"
      }
    ],
    "hook": "string",
    "cta": "string"
  }
}`,
  buildUserPrompt(input: {
    brandContextMarkdown: string;
    platform: string;
    format: string;
    pillarName?: string | null;
    topic: string;
    rejectionReason?: string | null;
  }) {
    return `${input.brandContextMarkdown}

## Script request
- Platform: ${input.platform}
- Format: ${input.format}
- Pillar: ${input.pillarName ?? "unspecified"}
- Topic: ${input.topic}
${input.rejectionReason ? `- Rejection feedback: ${input.rejectionReason}` : ""}

Return the script JSON.`;
  },
};
