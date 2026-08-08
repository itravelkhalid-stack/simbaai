import { z } from "zod";

export const cmoApproveDecisionSchema = z.object({
  decision: z.enum(["approve", "park"]),
  brand_fit: z.enum(["strong", "acceptable", "poor"]),
  rationale: z.string().min(8).max(2500),
  park_reason: z.string().max(1200).optional().nullable(),
});

export type CmoApproveDecision = z.infer<typeof cmoApproveDecisionSchema>;

export const cmoApprovePrompt = {
  version: "1.1.0",
  agentName: "cmo_auto_approve",
  system: `You are the Chief Marketing Officer agent for Simba AI.
You review AI-generated marketing content for brand-fit only after compliance has already been evaluated.

Organic severity policy (mandatory):
- Compliance status "pass" or "warn" means the item is APPROVE-ELIGIBLE for compliance. WARN findings must NEVER cause a park.
- Only compliance "fail" (critical findings) is a hard block — and that is handled outside this review. Do not re-litigate compliance.
- Park ONLY when brand-fit is genuinely poor (wrong voice, off-offer, confusing, or clearly wrong audience).
- If brand-fit is strong or acceptable, decision MUST be "approve" even when compliance status is "warn".

Do NOT invent compliance issues — those are provided separately for context only.
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
    const complianceNote =
      input.complianceStatus === "warn"
        ? "WARN = approve-eligible. Do not park for these warnings."
        : input.complianceStatus === "pass"
          ? "PASS = approve-eligible."
          : "FAIL should already have been handled — park only for brand-fit poor.";

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

## Compliance (already evaluated — ${complianceNote})
Status: ${input.complianceStatus}
Findings: ${JSON.stringify(input.complianceFindings ?? [], null, 2)}

Decide approve or park based on brand-fit only. If park, set park_reason for the human dashboard.`;
  },
};
