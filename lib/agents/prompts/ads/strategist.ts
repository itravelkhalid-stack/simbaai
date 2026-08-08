import { z } from "zod";

export const mediaPlanSchema = z.object({
  name: z.string(),
  summary: z.string(),
  platform_split: z
    .array(
      z.object({
        platform: z.enum(["meta", "tiktok", "google", "x", "bing"]),
        budget_pct: z.number(),
        rationale: z.string(),
      }),
    )
    .min(1),
  funnel_stages: z
    .array(
      z.object({
        stage: z.string(),
        budget_pct: z.number(),
        goal: z.string(),
      }),
    )
    .min(1),
  campaigns: z
    .array(
      z.object({
        name: z.string(),
        platform: z.enum(["meta", "tiktok", "google", "x", "bing"]),
        objective: z.string(),
        funnel_stage: z.string(),
        daily_budget_pence: z.number().int().nonnegative(),
        audience: z.string(),
        targeting_notes: z.string(),
        creative_requirements: z.array(z.string()),
      }),
    )
    .min(1),
  creative_brief: z.string(),
  risks: z.array(z.string()).default([]),
});

export const creativeVariantsSchema = z.object({
  variants: z
    .array(
      z.object({
        variant_label: z.string(),
        format: z.string(),
        headline: z.string(),
        primary_text: z.string(),
        description: z.string().optional().default(""),
        cta: z.string(),
        hook: z.string().optional().default(""),
      }),
    )
    .min(1)
    .max(8),
});

export const optimisationSchema = z.object({
  recommendations: z
    .array(
      z.object({
        recommendation_type: z.enum([
          "pause_campaign",
          "activate_campaign",
          "shift_budget",
          "refresh_creative",
          "adjust_targeting",
          "other",
        ]),
        title: z.string(),
        rationale: z.string(),
        campaign_name: z.string().optional(),
        payload: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
});

export const adsStrategistPrompt = {
  system: `You are Simba AI Ads Strategist. Produce a full paid media plan as JSON only.
Respect brand voice, audiences, and research. Money is integer pence (GBP unless told otherwise).
The monthly budget is a COMBINED pot across ALL platforms — platform_split percentages must sum to ~100 of that one pot. Never assign the full monthly pot to each platform.
When allocation mode is manual, treat given platform shares as hard constraints. When AI allocates, you may rebalance using performance and seasonality but must respect any locked manual pins.
Never invent API IDs. Structure campaigns by funnel stage with clear creative requirements.
Respond with a single JSON object matching the schema described by the user.`,
};

export const adsCreativePrompt = {
  system: `You are Simba AI Ads Creative agent. Write platform-correct ad copy variants in brand voice as JSON only.
Meta: short headlines, primary text, description, CTA.
TikTok: include a strong hook; conversational primary text.
Google: tight headlines and descriptions.
X/Bing: concise, benefit-led.
Each variant must be distinct. JSON only.`,
};

export const adsOptimisationPrompt = {
  system: `You are Simba AI Ads Optimisation agent. Review campaign performance vs targets and propose actionable recommendations as JSON only.
Prefer pause underperformers, shift budget to winners, refresh fatigued creatives.
Never assume auto-apply — recommendations are for human approval.
payload may include: campaign_id, daily_budget_pence, from_campaign_id, to_campaign_id, amount_pence.
JSON only.`,
};
