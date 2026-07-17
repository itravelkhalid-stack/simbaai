import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  complianceCheckerPrompt,
  complianceCheckResultSchema,
} from "@/lib/agents/prompts/compliance/checker";
import type { ComplianceProfile } from "@/lib/types/compliance";

export async function runComplianceProfileCheck(input: {
  profile: ComplianceProfile;
  entityType: string;
  title?: string | null;
  body: string;
  extra?: Record<string, unknown>;
}) {
  const enabledRules = (input.profile.rules ?? []).filter((r) => r.enabled);
  return runClaudeJson({
    system: complianceCheckerPrompt.system,
    user: complianceCheckerPrompt.buildUserPrompt({
      entityType: input.entityType,
      industry: input.profile.industry,
      jurisdictions: input.profile.jurisdictions,
      regulated: input.profile.regulated,
      rules: enabledRules,
      requiredDisclaimers: input.profile.required_disclaimers,
      bannedClaims: input.profile.banned_claims,
      bannedTerms: input.profile.banned_terms,
      title: input.title,
      body: input.body,
      extra: input.extra,
    }),
    schema: complianceCheckResultSchema,
    maxTokens: 2500,
  });
}
