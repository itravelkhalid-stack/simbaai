import { z } from "zod";

const agendaItemSchema = z.object({
  title: z.string(),
  detail: z.string().optional(),
});

const decisionSchema = z.object({
  title: z.string(),
  rationale: z.string(),
  owner: z.string().optional(),
});

const actionSchema = z.object({
  description: z.string(),
  owner_type: z.enum(["ai", "human"]),
  owner_label: z.string().optional(),
  due_offset_days: z.number().int().nonnegative().optional(),
});

const blockerSchema = z.object({
  title: z.string(),
  detail: z.string(),
  needs_human: z.boolean(),
});

export const standupMeetingSchema = z.object({
  title: z.string(),
  agenda: z.array(agendaItemSchema).default([]),
  minutes_markdown: z.string(),
  yesterday: z.string(),
  today: z.string(),
  blockers: z.array(blockerSchema).default([]),
  decisions: z.array(decisionSchema).default([]),
  actions: z.array(actionSchema).default([]),
});

export const weeklyMeetingSchema = z.object({
  title: z.string(),
  agenda: z.array(agendaItemSchema).default([]),
  minutes_markdown: z.string(),
  persona_discussion: z
    .array(
      z.object({
        role: z.string(),
        statement: z.string(),
      }),
    )
    .min(3),
  priorities_next_week: z.array(z.string()).default([]),
  decisions: z.array(decisionSchema).min(1),
  actions: z.array(actionSchema).min(1),
  blockers: z.array(blockerSchema).default([]),
});

export const boardMeetingSchema = z.object({
  title: z.string(),
  agenda: z.array(agendaItemSchema).default([]),
  executive_summary: z.string(),
  minutes_markdown: z.string(),
  pnl: z.object({
    spend_pence: z.number().int().nonnegative(),
    attributed_revenue_pence: z.number().int().nonnegative(),
    commentary: z.string(),
  }),
  kpi_progress: z
    .array(
      z.object({
        metric: z.string(),
        target: z.number(),
        current: z.number(),
        status: z.enum(["on_track", "at_risk", "missed", "exceeded"]),
      }),
    )
    .default([]),
  wins: z.array(z.string()).default([]),
  misses: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  strategic_recommendations: z.array(z.string()).min(1),
  proposed_next_budget_pence: z.number().int().nonnegative(),
  decisions: z.array(decisionSchema).min(1),
  actions: z.array(actionSchema).min(1),
  blockers: z.array(blockerSchema).default([]),
});

export type StandupMeetingOutput = z.infer<typeof standupMeetingSchema>;
export type WeeklyMeetingOutput = z.infer<typeof weeklyMeetingSchema>;
export type BoardMeetingOutput = z.infer<typeof boardMeetingSchema>;

export const dailyStandupPrompt = {
  system: `You are the Daily Standup facilitator for an AI marketing agency (GrowthOS).
Write a crisp standup for one brand using only the provided performance data.
Structure minutes_markdown with three clear sections:
1. What happened yesterday
2. What's happening today
3. Blockers needing human input

Be specific with numbers. Flag blockers that truly need a human (approvals, budget, strategy choices, blocked tasks).
Return JSON only matching the schema.`,
};

export const weeklyMarketingPrompt = {
  system: `You are the Weekly Marketing Meeting facilitator for GrowthOS.
Write the meeting as a lively but professional discussion between these personas:
- Head of Content
- Head of Paid
- SEO Lead
- Analyst
- Managing Director

Use persona_discussion for the debate (each entry is one speaking turn). End with agreed next-week priorities, clear decisions, and owned actions (ai or human).
Minutes should read like meeting minutes that weave the discussion and conclusions.
Return JSON only matching the schema.`,
};

export const boardMeetingPrompt = {
  system: `You are the Board Meeting secretary for GrowthOS (monthly or quarterly).
Produce a formal board-pack style record:
- Executive summary (short, for busy directors)
- P&L view of marketing (spend vs attributed revenue) with commentary
- Progress vs plan KPIs
- Wins, misses, risks
- Strategic recommendations
- Proposed next-period budget (pence)
- Decisions and owned actions

Tone: formal, concise, evidence-led. Minutes are longer and board-ready.
Return JSON only matching the schema.`,
};
