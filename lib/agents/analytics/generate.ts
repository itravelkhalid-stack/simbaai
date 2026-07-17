import { z } from "zod";

import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  analyticsAnswerPrompt,
  analyticsAnomalyPrompt,
  analyticsAskPrompt,
} from "@/lib/agents/prompts/analytics/ask";
import {
  QUERY_CATALOG_FOR_PROMPT,
  queryPlanSchema,
  type QueryPlan,
} from "@/lib/data/query-layer";

export async function planAnalyticsQuery(params: {
  question: string;
  brandName: string;
  today: string;
}) {
  return runClaudeJson({
    system: analyticsAskPrompt.system,
    user: `Brand: ${params.brandName}
Today (UTC): ${params.today}

Whitelisted queries:
${QUERY_CATALOG_FOR_PROMPT}

User question:
${params.question}
`,
    schema: queryPlanSchema,
    maxTokens: 800,
  });
}

export async function answerAnalyticsQuestion(params: {
  question: string;
  plan: QueryPlan;
  resultSummary: string;
  rows: Array<Record<string, string | number | null>>;
}) {
  return runClaudeJson({
    system: analyticsAnswerPrompt.system,
    user: `Question: ${params.question}

Query plan: ${JSON.stringify(params.plan)}

Result summary: ${params.resultSummary}

Rows (truncated):
${JSON.stringify(params.rows.slice(0, 30), null, 2)}
`,
    schema: z.object({
      answer: z.string().min(1).max(2000),
    }),
    maxTokens: 1000,
  });
}

export async function generateAnomalyContext(params: {
  brandName: string;
  title: string;
  detail: string;
  metricKey: string;
  deltaPct: number;
}) {
  return runClaudeJson({
    system: analyticsAnomalyPrompt.system,
    user: `Brand: ${params.brandName}
Flag: ${params.title}
Detail: ${params.detail}
Metric: ${params.metricKey}
Delta %: ${params.deltaPct}
`,
    schema: z.object({
      context: z.string().min(1).max(800),
    }),
    maxTokens: 500,
  });
}
