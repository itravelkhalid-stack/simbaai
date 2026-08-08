import { z } from "zod";

export const complianceFindingSchema = z.object({
  severity: z.enum(["info", "warning", "critical"]),
  code: z.string(),
  message: z.string(),
  suggestion: z.string().optional(),
  rule_id: z.string().optional(),
});

export const complianceCheckResultSchema = z.object({
  findings: z.array(complianceFindingSchema),
  status: z.enum(["pass", "warn", "fail"]).optional(),
});

export const complianceCheckerPrompt = {
  agentName: "compliance_checker",
  system: `You are Simba AI Compliance Checker for marketing copy (content, ads, email, SEO).

Evaluate the material against:
1) The brand compliance profile (rules, banned claims/terms, required disclaimers, approved claims, terms URLs, industry, jurisdictions, regulated flag)
2) General advertising standards: misleading claims, unsubstantiated superlatives, missing disclaimers, before/after claims, pricing clarity

Rules:
- Be precise; cite which rule_id or standard when possible.
- severity critical = would fail approval; warning = needs attention; info = advisory.
- If required disclaimers are missing from the text, flag missing_disclaimers as critical when the profile lists them and claims warrant them OR industry is regulated.
- Match banned_claims / banned_terms case-insensitively (including close paraphrases).
- APPROVED CLAIMS: Do NOT flag unsubstantiated/superlative findings for wording that matches or is a faithful paraphrase of an approved_claims entry. Prefer suggesting a short "T&Cs apply" + a terms_urls link when qualification is still useful.
- TERMS URLS: When a claim needs qualification, suggest linking one of the profile terms_urls rather than inventing a URL.
- Do not rewrite the copy; only return findings.
- Do not invent an INDUSTRY_MISMATCH finding. Use the profile industry as given; never second-guess whether the brand "should" be in a different industry.
- If clean, return findings: [].

Return JSON only:
{
  "findings": [
    {
      "severity": "info|warning|critical",
      "code": "string",
      "message": "string",
      "suggestion": "string",
      "rule_id": "string"
    }
  ]
}`,
  buildUserPrompt(input: {
    entityType: string;
    industry: string;
    jurisdictions: string[];
    regulated: boolean;
    rules: unknown;
    requiredDisclaimers: string[];
    bannedClaims: string[];
    bannedTerms: string[];
    approvedClaims: string[];
    termsUrls: string[];
    title?: string | null;
    body: string;
    extra?: Record<string, unknown>;
  }) {
    return `## Entity
Type: ${input.entityType}
Industry: ${input.industry}
Jurisdictions: ${input.jurisdictions.join(", ") || "unspecified"}
Regulated: ${input.regulated}

## Profile rules
${JSON.stringify(input.rules, null, 2)}

## Required disclaimers
${JSON.stringify(input.requiredDisclaimers)}

## Approved claims (pre-cleared — do not flag these as unsubstantiated)
${JSON.stringify(input.approvedClaims)}

## Terms / disclaimer URLs (use these when suggesting qualification links)
${JSON.stringify(input.termsUrls)}

## Banned claims
${JSON.stringify(input.bannedClaims)}

## Banned terms
${JSON.stringify(input.bannedTerms)}

## Material
Title: ${input.title ?? "(none)"}
Body:
${input.body.slice(0, 20000)}

Extra:
${JSON.stringify(input.extra ?? {}, null, 2).slice(0, 4000)}
`;
  },
};
