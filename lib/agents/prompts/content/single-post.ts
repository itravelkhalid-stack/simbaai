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
When format is "story", write short (under 80 characters) visual-first copy suitable for Instagram or Facebook Stories — no long paragraphs, minimal hashtags.
When an image brief is provided, write copy that describes and complements THAT specific image — reference what is visible (subject, setting, mood) naturally; do not invent visuals that contradict the image.
LINK RULE: Only use URLs listed under "## Allowed links" in the brand context (website root and explicitly listed landing/terms URLs). Never invent paths, pages, or domains. If no allowed link fits, omit the URL entirely.`,
  buildUserPrompt(input: {
    brandContextMarkdown: string;
    platform: string;
    format: string;
    pillarName?: string | null;
    topic: string;
    rejectionReason?: string | null;
    imageContext?: {
      subject: string;
      setting: string;
      mood: string;
      colours: string[];
      description: string;
    } | null;
  }) {
    const imageBlock = input.imageContext
      ? `
## Selected image (write copy ABOUT this image)
The post will use this library image. Caption must feel like one piece with the visual — describe what's shown, not a generic topic.
- Subject: ${input.imageContext.subject}
- Setting: ${input.imageContext.setting}
- Mood / style: ${input.imageContext.mood}
- Colours: ${input.imageContext.colours.length ? input.imageContext.colours.join(", ") : "unspecified"}
${input.imageContext.description ? `- Description: ${input.imageContext.description}` : ""}`
      : "";

    return `${input.brandContextMarkdown}
${imageBlock}

## Request
- Platform: ${input.platform}
- Format: ${input.format}
- Pillar: ${input.pillarName ?? "unspecified"}
- Topic / brief: ${input.topic}
${input.rejectionReason ? `- Prior rejection feedback to address: ${input.rejectionReason}` : ""}

Produce 3 variant drafts as JSON.`;
  },
};
