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
import type { CombinedAdPotActual } from "@/lib/finance/metrics";

export async function generateFinanceWeeklyAnalysis(params: {
  brandContext: BrandContext;
  periodLabel: string;
  budgetActual: ChannelBudgetActual[];
  blended: FinanceBlendedMetrics;
  priorBlended?: FinanceBlendedMetrics | null;
  combinedAdPot?: CombinedAdPotActual | null;
}) {
  return runClaudeJson({
    system: financeAnalystPrompt.system,
    user: `${params.brandContext.markdown}

## Period
${params.periodLabel}

## Combined ad pot (ALL platforms share this pot — primary budget control)
${JSON.stringify(params.combinedAdPot ?? {}, null, 2)}

## Channel budget vs actual / pacing (ledger channels; reallocations must still respect the combined pot)
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
