import {
  CONTENT_JSON_CONTRACT,
  CONTENT_PROMPT_VERSION,
  PLATFORM_RULES,
} from "@/lib/agents/prompts/content/shared";

export const repurposePrompt = {
  version: CONTENT_PROMPT_VERSION,
  agentName: "content_repurpose",
  system: `You are Simba AI Repurposing Agent. Adapt one source post to other platforms properly — restructure, do not copy-paste.
${PLATFORM_RULES}
${CONTENT_JSON_CONTRACT}
Shape:
{
  "adaptations": [
    {
      "platform": "instagram|facebook|tiktok|x|linkedin|youtube|pinterest",
      "format": "post|carousel|reel_script|story|thread|short_script",
      "title": "string",
      "copy": "string",
      "hashtags": ["string"],
      "structured": {},
      "notes": "what changed for this platform"
    }
  ]
}`,
  buildUserPrompt(input: {
    brandContextMarkdown: string;
    sourcePlatform: string;
    sourceFormat: string;
    sourceCopy: string;
    sourceHashtags: string[];
    sourceStructured: Record<string, unknown>;
    targetPlatforms: string[];
  }) {
    return `${input.brandContextMarkdown}

## Source item
- Platform: ${input.sourcePlatform}
- Format: ${input.sourceFormat}
- Copy: ${input.sourceCopy}
- Hashtags: ${input.sourceHashtags.join(", ")}
- Structured: ${JSON.stringify(input.sourceStructured)}

## Targets
Adapt to: ${input.targetPlatforms.join(", ")}

Return adaptations JSON.`;
  },
};
