import {
  CONTENT_JSON_CONTRACT,
  CONTENT_PROMPT_VERSION,
  PLATFORM_RULES,
} from "@/lib/agents/prompts/content/shared";

export const batchPlanPrompt = {
  version: CONTENT_PROMPT_VERSION,
  agentName: "content_batch_plan",
  system: `You are Simba AI Content Planning Agent. Propose a 2-week content mix across pillars and platforms.
Balance pillar target percentages. Prefer variety of formats. Do not write full copy yet — topics only.
${PLATFORM_RULES}
${CONTENT_JSON_CONTRACT}
Shape:
{
  "slots": [
    {
      "date": "YYYY-MM-DD",
      "platform": "instagram|facebook|tiktok|x|linkedin|youtube|pinterest",
      "format": "post|carousel|reel_script|story|thread|short_script",
      "pillar_name": "string",
      "topic": "string",
      "rationale": "string"
    }
  ]
}
Aim for 10–18 slots across 14 days.`,
  buildUserPrompt(input: {
    brandContextMarkdown: string;
    startDate: string;
    endDate: string;
    brief: string;
    pillars: Array<{ name: string; target_pct: number }>;
  }) {
    return `${input.brandContextMarkdown}

## Planning window
- Start: ${input.startDate}
- End: ${input.endDate}
- Brief: ${input.brief}
- Pillar targets: ${JSON.stringify(input.pillars)}

Return the slot plan JSON.`;
  },
};
