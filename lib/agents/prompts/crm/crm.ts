import { z } from "zod";

export const leadScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  reasoning: z.string(),
  suggested_stage: z
    .enum([
      "subscriber",
      "lead",
      "mql",
      "sql",
      "customer",
      "repeat",
      "churned",
    ])
    .optional(),
});

export const followUpEmailSchema = z.object({
  subject: z.string(),
  body_markdown: z.string(),
  rationale: z.string(),
});

export const pipelineReviewSchema = z.object({
  summary_markdown: z.string(),
  stalled_deal_ids: z.array(z.string()).default([]),
  next_actions: z
    .array(
      z.object({
        deal_id: z.string().optional(),
        action: z.string(),
      }),
    )
    .min(1),
});

export const leadScorePrompt = {
  system: `You are a B2B/B2C lead scoring analyst for Simba AI CRM.
Score the contact 0–100 from engagement signals and fit (company, tags, revenue, lifecycle, activity).
Explain briefly. Optionally suggest a lifecycle stage.
Return JSON only.`,
};

export const followUpEmailPrompt = {
  system: `You draft a short, brand-voice follow-up email for a CRM contact.
Be specific to their stage, deals, and recent activity. No spammy language.
Return JSON: subject, body_markdown, rationale.`,
};

export const pipelineReviewPrompt = {
  system: `You are a sales pipeline coach for Simba AI.
Review open deals, flag stalled ones (no movement / past expected close), and propose next best actions.
Return JSON matching the schema with summary_markdown, stalled_deal_ids, next_actions.`,
};
