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
The brand's monthly ad budget is a SINGLE combined pot across all ad platforms (Meta, Google, etc.) — never treat each platform as having the full pot.
Comment on efficiency trends (ROAS, MER, CAC, pacing) against that combined pot first, then channel mixes within it.
Flag over/under-spend. Propose budget reallocations between channels with amounts in pence that sum within the combined pot.
Be specific and numeric. Return JSON only.`,
};
