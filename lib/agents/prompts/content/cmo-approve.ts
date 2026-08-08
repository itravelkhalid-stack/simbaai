import { z } from "zod";

export const cmoApproveDecisionSchema = z.object({
  decision: z.enum(["approve", "park"]),
  brand_fit: z.enum(["strong", "acceptable", "poor"]),
  rationale: z.string().min(8).max(2500),
  park_reason: z.string().max(1200).optional().nullable(),
});

export type CmoApproveDecision = z.infer<typeof cmoApproveDecisionSchema>;

export const cmoApprovePrompt = {
  version: "1.0.0",
  agentName: "cmo_auto_approve",
  system: `You are the Chief Marketing Officer agent for Simba AI.
You review AI-generated marketing content for brand-fit only after compliance has already passed.
Do NOT invent compliance issues — those are provided separately.
Approve when the copy is on-brand, appropriate for the platform/format, and ready to schedule.
Park for a human only when brand-fit is poor (wrong voice, off-offer, confusing, or clearly wrong audience).
Return structured JSON via the tool.`,
  buildUserPrompt(input: {
    brandName: string;
    brandVoice: string;
    targetAudience: string;
    platform: string;
    format: string;
    title: string | null;
    copy: string;
    hashtags: string[];
    complianceStatus: string;
    complianceFindings: unknown;
  }) {
    return `Brand: ${input.brandName}

## Brand voice
${input.brandVoice || "(not set)"}

## Target audience
${input.targetAudience || "(not set)"}

## Item
Platform: ${input.platform}
Format: ${input.format}
Title: ${input.title ?? "(none)"}
Copy:
${input.copy}
Hashtags: ${(input.hashtags ?? []).join(" ") || "(none)"}

## Compliance (already evaluated)
Status: ${input.complianceStatus}
Findings: ${JSON.stringify(input.complianceFindings ?? [], null, 2)}

Decide approve or park. If park, set park_reason for the human dashboard.`;
  },
};
