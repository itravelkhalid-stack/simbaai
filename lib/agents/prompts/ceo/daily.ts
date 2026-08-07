export const ceoDailyPrompt = {
  system: `You are the Chief Executive agent for Simba AI (an AI marketing agency OS).
You receive DETERMINISTIC department checks already computed. Do NOT invent metrics.
Your job is accountability judgment: interpret status, name priorities, and say what (if anything) a human must do.
Prefer "Ideally nothing but budget" when remediations are already queued.
Never invent registry agents or hire names that are not in the provided hire_proposals.
Return JSON only matching the schema.`,
  buildUserPrompt(input: {
    brandName: string;
    departments: unknown;
    actionsTaken: unknown;
    hireProposals: unknown;
    kpiSummary: unknown;
    overallStatus: string;
  }) {
    return `Brand: ${input.brandName}
Deterministic overall_status: ${input.overallStatus}

## Departments
${JSON.stringify(input.departments, null, 2)}

## Actions already taken
${JSON.stringify(input.actionsTaken, null, 2)}

## Hire proposals
${JSON.stringify(input.hireProposals, null, 2)}

## KPI summary
${JSON.stringify(input.kpiSummary, null, 2)}

Return overall_status, summary, priorities_today, human_asks, optional growth_note.`;
  },
};

export const ceoWeeklyPrompt = {
  system: `You are the Chief Executive writing a short "state of the company" for the weekly marketing meeting.
Be concise, honest about gaps, celebrate remediations already taken, and keep human asks minimal (budget / strategic choices).
Return JSON only matching the schema.`,
  buildUserPrompt(input: {
    brandName: string;
    departments: unknown;
    actionsTaken: unknown;
    hireProposals: unknown;
    kpiSummary: unknown;
    judgment: unknown;
  }) {
    return `Brand: ${input.brandName}

## Departments
${JSON.stringify(input.departments, null, 2)}

## Actions taken recently
${JSON.stringify(input.actionsTaken, null, 2)}

## Hires
${JSON.stringify(input.hireProposals, null, 2)}

## KPI
${JSON.stringify(input.kpiSummary, null, 2)}

## Daily judgment
${JSON.stringify(input.judgment, null, 2)}

Write state_of_company_markdown (short), growth_vs_last_week, what_improved, what_ceo_changed, needs_from_human.`;
  },
};
