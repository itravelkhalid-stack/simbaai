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
  action_type: z
    .enum([
      "pause_campaign",
      "shift_budget",
      "change_content_mix",
      "flag_risk",
      "note",
    ])
    .default("note"),
  payload: z
    .object({
      campaign_id: z.string().optional(),
      platform: z.enum(["meta", "google", "tiktok", "x", "bing"]).optional(),
      amount_pence: z.number().int().optional(),
      current_daily_budget_pence: z.number().int().optional(),
      proposed_daily_budget_pence: z.number().int().optional(),
      content_mix_notes: z.string().optional(),
      risk_code: z.string().optional(),
    })
    .passthrough()
    .optional()
    .default({}),
});

const blockerSchema = z.object({
  title: z.string(),
  detail: z.string(),
  needs_human: z.boolean(),
});

const TYPED_ACTIONS_CONTRACT = `
Typed actions (required when recommending operational changes):
- action_type: pause_campaign | shift_budget | change_content_mix | flag_risk | note
- payload.campaign_id must be a real ad campaign UUID from the data when pausing/shifting budget
- shift_budget: include amount_pence and/or proposed_daily_budget_pence
- change_content_mix: include content_mix_notes
- flag_risk / note: human review only
Every meeting minutes MUST end with sections "## Actions taken" and "## Actions awaiting approval"
(placeholders are fine — the system fills results after execution).
If a source status is "not_connected", do NOT treat its metrics as a performance failure.
Never raise a blocker about "0 clicks", "zero organic visibility", "no sessions", or similar when that source is not_connected.
Only interpret numeric zeros as real performance when status is "connected" (or the source has live rows).
Missing/not_connected sources belong in gaps / setup actions — not performance alarms.
If data sources are missing/empty, say so explicitly — never invent numbers.
GA4 intent/engagement proxy events (form_start, scroll, etc.) are NOT revenue conversions.
When ga4.revenue_tracking_configured is false, or when only intent_events are available:
- Label those metrics explicitly as "intent proxies", never as conversions/sales/bookings.
- Do NOT compute ROAS, CPA, or revenue attribution from intent proxies.
- State that GA4 purchase/revenue tracking is not configured instead of inventing a figure.
Always include every item under "Standing setup blockers" in the blockers array with needs_human=true.
`;

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

export const annualReviewSchema = z.object({
  title: z.string(),
  agenda: z.array(agendaItemSchema).default([]),
  executive_summary: z.string(),
  minutes_markdown: z.string(),
  year_in_review: z.string(),
  plan_vs_actual: z
    .array(
      z.object({
        area: z.string(),
        planned: z.string(),
        actual: z.string(),
        verdict: z.enum(["hit", "miss", "exceeded", "unknown"]),
      }),
    )
    .default([]),
  kpi_attainment: z
    .array(
      z.object({
        metric: z.string(),
        target: z.number(),
        actual: z.number(),
        attainment_pct: z.number(),
      }),
    )
    .default([]),
  strategic_recommendations_next_year: z.array(z.string()).min(1),
  decisions: z.array(decisionSchema).min(1),
  actions: z.array(actionSchema).min(1),
  blockers: z.array(blockerSchema).default([]),
});

export type StandupMeetingOutput = z.infer<typeof standupMeetingSchema>;
export type WeeklyMeetingOutput = z.infer<typeof weeklyMeetingSchema>;
export type BoardMeetingOutput = z.infer<typeof boardMeetingSchema>;
export type AnnualReviewOutput = z.infer<typeof annualReviewSchema>;

export const dailyStandupPrompt = {
  system: `You are the Daily Standup facilitator for an AI marketing agency (Simba AI).
Write a crisp standup for one brand using only the provided performance data.
Structure minutes_markdown with three clear sections:
1. What happened yesterday
2. What's happening today
3. Blockers needing human input

Be specific with numbers. Flag blockers that truly need a human (approvals, budget, strategy choices, blocked tasks).
${TYPED_ACTIONS_CONTRACT}
Return JSON only matching the schema.`,
};

export const weeklyMarketingPrompt = {
  system: `You are the Weekly Marketing Meeting facilitator for Simba AI.
Write the meeting as a lively but professional discussion between these personas:
- Head of Content
- Head of Paid
- SEO Lead
- Analyst
- Managing Director

Use persona_discussion for the debate (each entry is one speaking turn). End with agreed next-week priorities, clear decisions, and owned typed actions (ai or human).
When a campaign is clearly underperforming vs KPI targets, prefer pause_campaign or shift_budget with a real campaign_id from the data.
Minutes should read like meeting minutes that weave the discussion and conclusions.
${TYPED_ACTIONS_CONTRACT}
Return JSON only matching the schema.`,
};

export const boardMeetingPrompt = {
  system: `You are the Board Meeting secretary for Simba AI (monthly or quarterly).
Produce a formal board-pack style record:
- Executive summary (short, for busy directors)
- P&L view of marketing (spend vs attributed revenue) with commentary
- Progress vs plan KPIs
- Wins, misses, risks
- Strategic recommendations
- Proposed next-period budget (pence)
- Decisions and owned typed actions

Tone: formal, concise, evidence-led. Minutes are longer and board-ready.
${TYPED_ACTIONS_CONTRACT}
Return JSON only matching the schema.`,
};

export const annualReviewPrompt = {
  system: `You are the Annual Review facilitator for Simba AI.
Produce a full-year retrospective vs plan:
- Year in review narrative
- Plan vs actual by major area
- KPI attainment for the year
- Strategic recommendations for next year
- Decisions and typed actions to set up the next year

Be honest about data gaps. Do not invent annual totals that are not in the provided data.
${TYPED_ACTIONS_CONTRACT}
Return JSON only matching the schema.`,
};
