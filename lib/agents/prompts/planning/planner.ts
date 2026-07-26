import { z } from "zod";

const kpiSchema = z.object({
  metric: z.string(),
  target: z.number(),
  current: z.number().optional(),
  unit: z.string().optional(),
  source: z.string().optional(),
});

export const marketingPlanDocumentSchema = z.object({
  summary: z.string(),
  objectives: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        success_metric: z.string(),
      }),
    )
    .min(1),
  strategies: z
    .array(
      z.object({
        title: z.string(),
        rationale: z.string(),
        linked_objectives: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  campaigns: z
    .array(
      z.object({
        key: z.string(),
        name: z.string(),
        goal: z.string(),
        channels: z.array(z.string()).min(1),
        budget_pence: z.number().int().nonnegative(),
        start_offset_days: z.number().int().nonnegative(),
        duration_days: z.number().int().positive(),
        kpis: z.array(kpiSchema).default([]),
        tactics: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  channel_tactics: z
    .array(
      z.object({
        channel: z.string(),
        tactics: z.array(z.string()),
        budget_pct: z.number(),
      }),
    )
    .min(1),
  budget_split: z
    .array(
      z.object({
        channel: z.string(),
        amount_pence: z.number().int().nonnegative(),
        rationale: z.string(),
      }),
    )
    .min(1),
  kpi_targets: z.array(kpiSchema).min(1),
  task_breakdown: z
    .array(
      z.object({
        campaign_key: z.string(),
        title: z.string(),
        description: z.string(),
        module: z.enum([
          "content",
          "ads",
          "email",
          "seo",
          "social",
          "research",
          "other",
        ]),
        assignee_type: z.enum(["ai", "human"]),
        due_offset_days: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export const marketingPlannerPrompt = {
  system: `You are Simba AI Marketing Planner. Produce a full quarterly/monthly marketing plan as JSON only.
Money is integer pence. Campaign keys must be stable slugs used by task_breakdown.campaign_key.
Link tasks to modules Simba AI can execute: content, ads, email, seo, social, research.
Prefer a mix of AI-assignee and human-assignee tasks. Include KPI targets with metric/target/unit/source hints.`,
};
