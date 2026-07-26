import { z } from "zod";

import { CONTENT_JSON_CONTRACT, CONTENT_PROMPT_VERSION } from "@/lib/agents/prompts/content/shared";

export const growthReviewSchema = z.object({
  summary: z.string().min(1),
  best_formats: z
    .array(
      z.object({
        format: z.string(),
        why: z.string(),
        engagement_score: z.number().optional(),
      }),
    )
    .default([]),
  best_topics: z
    .array(
      z.object({
        topic: z.string(),
        why: z.string(),
      }),
    )
    .default([]),
  best_posting_times: z
    .array(
      z.object({
        window: z.string(),
        why: z.string(),
      }),
    )
    .default([]),
  next_batch_brief: z.string().min(1),
  suggested_slots: z
    .array(
      z.object({
        platform: z.enum([
          "instagram",
          "facebook",
          "tiktok",
          "x",
          "linkedin",
          "youtube",
          "pinterest",
        ]),
        format: z.enum([
          "post",
          "carousel",
          "reel_script",
          "story",
          "thread",
          "short_script",
        ]),
        topic: z.string(),
        pillar_hint: z.string().optional(),
        preferred_day_offset: z.number().int().min(0).max(13).optional(),
      }),
    )
    .max(12)
    .default([]),
});

export type GrowthReview = z.infer<typeof growthReviewSchema>;

export const growthAgentPrompt = {
  version: CONTENT_PROMPT_VERSION,
  agentName: "organic_growth",
  system: `You are Simba AI Organic Growth Agent. Review recent organic social performance and recommend what the next content batch should emphasize.
Focus on formats, topics, and posting times that drove engagement. Be concrete and brand-safe.
Do not invent metrics that are not in the input. Prefer doubling down on winners over radical pivots.
${CONTENT_JSON_CONTRACT}
Return JSON matching:
{
  "summary": string,
  "best_formats": [{ "format": string, "why": string, "engagement_score": number? }],
  "best_topics": [{ "topic": string, "why": string }],
  "best_posting_times": [{ "window": string, "why": string }],
  "next_batch_brief": string,
  "suggested_slots": [{
    "platform": "instagram|facebook|tiktok|x|linkedin|youtube|pinterest",
    "format": "post|carousel|reel_script|story|thread|short_script",
    "topic": string,
    "pillar_hint": string?,
    "preferred_day_offset": number?
  }]
}`,
  buildUserPrompt(input: {
    brandContextMarkdown: string;
    metricsMarkdown: string;
    windowLabel: string;
  }) {
    return `${input.brandContextMarkdown}

## Performance window
${input.windowLabel}

## Content metrics
${input.metricsMarkdown}

Produce the growth review JSON for the next content batch.`;
  },
};
