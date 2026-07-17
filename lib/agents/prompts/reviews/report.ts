import { z } from "zod";

const headlineSchema = z.object({
  metric: z.string(),
  label: z.string(),
  value: z.number(),
  previous: z.number(),
  delta_pct: z.number().nullable(),
  unit: z.string(),
  target: z.number().optional(),
});

const channelSchema = z.object({
  channel: z.string(),
  metrics: z.record(z.string(), z.number()),
  commentary: z.string(),
});

const campaignSchema = z.object({
  name: z.string(),
  status: z.string(),
  budget_pence: z.number().int().nonnegative(),
  spent_pence: z.number().int().nonnegative(),
  kpis: z
    .array(
      z.object({
        metric: z.string(),
        target: z.number(),
        current: z.number(),
        unit: z.string().optional(),
      }),
    )
    .default([]),
  commentary: z.string(),
});

export const reportContentSchema = z.object({
  title: z.string(),
  summary: z.string(),
  headline_numbers: z.array(headlineSchema).min(3),
  channels: z.array(channelSchema).min(1),
  campaigns: z.array(campaignSchema).default([]),
  insights: z.array(z.string()).min(2),
  recommendations: z.array(z.string()).min(2),
  plan_retrospective: z
    .object({
      what_worked: z.array(z.string()),
      what_missed: z.array(z.string()),
      lessons: z.array(z.string()),
    })
    .optional(),
  next_quarter_proposals: z.array(z.string()).optional(),
});

export type ReportAgentOutput = z.infer<typeof reportContentSchema>;

export const reportGeneratorPrompt = {
  system: `You are the GrowthOS reporting analyst. Write performance reports against the brand's configured north-star KPIs and targets.
Use only the provided metrics. Every headline number should include period-over-period delta.
Structure:
- headline_numbers: key metrics with value, previous, delta_pct, unit, and target when known
- channels: content, ads, email, seo (and crm if revenue present) with metrics + short commentary
- campaigns: performance vs KPI targets
- insights: what drove the change (causal, specific)
- recommendations: actionable next steps
For quarterly reports also include plan_retrospective and next_quarter_proposals.
Money values for headlines should be in major currency units (£) not pence, unless unit says otherwise.
Return JSON only matching the schema.`,
};

export function reportUserPrompt(cadence: string, includeQuarterly: boolean) {
  return `Generate a ${cadence} marketing performance report.
${includeQuarterly ? "This is a quarterly board-style report — include plan_retrospective and next_quarter_proposals." : "Do not include plan_retrospective or next_quarter_proposals."}
Align all commentary to the brand KPI targets listed in the data.`;
}
