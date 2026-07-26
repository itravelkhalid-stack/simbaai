import { z } from "zod";

export const financeAnalystSchema = z.object({
  summary_markdown: z.string(),
  alerts: z
    .array(
      z.object({
        severity: z.enum(["info", "warning", "critical"]),
        message: z.string(),
        channel: z.string().optional(),
      }),
    )
    .default([]),
  reallocation_suggestions: z
    .array(
      z.object({
        from_channel: z.string(),
        to_channel: z.string(),
        amount_pence: z.number().int().nonnegative(),
        rationale: z.string(),
      }),
    )
    .default([]),
});

export const financeAnalystPrompt = {
  system: `You are the Simba AI Finance analyst for a client's marketing P&L.
Comment on efficiency trends (ROAS, MER, CAC, pacing). Flag over/under-spend.
Propose budget reallocations between channels with amounts in pence.
Be specific and numeric. Return JSON only.`,
};
