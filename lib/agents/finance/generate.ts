import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  financeAnalystPrompt,
  financeAnalystSchema,
} from "@/lib/agents/prompts/finance/analyst";
import type { BrandContext } from "@/lib/brand/context";
import type {
  ChannelBudgetActual,
  FinanceBlendedMetrics,
} from "@/lib/types/finance";

export async function generateFinanceWeeklyAnalysis(params: {
  brandContext: BrandContext;
  periodLabel: string;
  budgetActual: ChannelBudgetActual[];
  blended: FinanceBlendedMetrics;
  priorBlended?: FinanceBlendedMetrics | null;
}) {
  return runClaudeJson({
    system: financeAnalystPrompt.system,
    user: `${params.brandContext.markdown}

## Period
${params.periodLabel}

## Budget vs actual / pacing
${JSON.stringify(params.budgetActual, null, 2)}

## Blended metrics
${JSON.stringify(params.blended, null, 2)}

## Prior period blended (if any)
${JSON.stringify(params.priorBlended ?? {}, null, 2)}
`,
    schema: financeAnalystSchema,
    maxTokens: 5000,
  });
}
