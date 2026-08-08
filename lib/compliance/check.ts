import { runComplianceProfileCheck } from "@/lib/agents/compliance/generate";
import { getPresetPack } from "@/lib/compliance/presets";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ComplianceCheck,
  ComplianceCheckStatus,
  ComplianceEntityType,
  ComplianceFinding,
  ComplianceProfile,
} from "@/lib/types/compliance";
import type { ComplianceFlag } from "@/lib/types/content";

function deriveStatus(findings: ComplianceFinding[]): ComplianceCheckStatus {
  if (findings.some((f) => f.severity === "critical")) return "fail";
  if (findings.some((f) => f.severity === "warning")) return "warn";
  return "pass";
}

/** Deterministic pre-pass for banned terms/claims before AI. */
export function runDeterministicScan(params: {
  body: string;
  bannedTerms: string[];
  bannedClaims: string[];
  requiredDisclaimers: string[];
  regulated: boolean;
}): ComplianceFinding[] {
  const text = params.body.toLowerCase();
  const findings: ComplianceFinding[] = [];

  for (const term of params.bannedTerms) {
    const t = term.trim().toLowerCase();
    if (t && text.includes(t)) {
      findings.push({
        severity: "critical",
        code: "banned_term",
        message: `Banned term detected: “${term}”.`,
        suggestion: "Remove or rephrase the banned term.",
        rule_id: "banned_terms",
      });
    }
  }

  for (const claim of params.bannedClaims) {
    const c = claim.trim().toLowerCase();
    if (c && text.includes(c)) {
      findings.push({
        severity: "critical",
        code: "banned_claim",
        message: `Banned claim pattern detected: “${claim}”.`,
        suggestion: "Remove or substantiate with approved wording.",
        rule_id: "banned_claims",
      });
    }
  }

  if (params.regulated && params.requiredDisclaimers.length) {
    const missing = params.requiredDisclaimers.filter((d) => {
      const snippet = d.slice(0, 24).toLowerCase();
      return snippet.length > 8 && !text.includes(snippet);
    });
    // Soft: only flag if copy looks promotional (has claim-like words)
    const looksPromotional =
      /\b(best|guarantee|proven|results|save|free|cure|treat|invest|return)\b/i.test(
        params.body,
      );
    if (looksPromotional && missing.length) {
      findings.push({
        severity: "critical",
        code: "missing_disclaimers",
        message: `Required disclaimer(s) appear missing: ${missing.slice(0, 2).join(" · ")}`,
        suggestion: "Add the required disclaimer(s) from the compliance profile.",
        rule_id: "missing_disclaimers",
      });
    }
  }

  return findings;
}

export async function getOrCreateComplianceProfile(params: {
  organizationId: string;
  brandId: string;
}): Promise<ComplianceProfile> {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("compliance_profiles")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .maybeSingle();

  if (existing) {
    const row = existing as ComplianceProfile;
    return {
      ...row,
      approved_claims: row.approved_claims ?? [],
      terms_urls: row.terms_urls ?? [],
    };
  }

  const pack = getPresetPack("general_ecommerce");
  const { data, error } = await supabase
    .from("compliance_profiles")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      industry: pack.industry,
      jurisdictions: pack.jurisdictions,
      regulated: pack.regulated,
      rules: pack.rules,
      required_disclaimers: pack.required_disclaimers,
      banned_claims: pack.banned_claims,
      banned_terms: pack.banned_terms,
      approved_claims: pack.approved_claims,
      terms_urls: pack.terms_urls,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create profile");
  return data as ComplianceProfile;
}

export async function getLatestComplianceCheck(params: {
  organizationId: string;
  entityType: ComplianceEntityType;
  entityId: string;
}): Promise<ComplianceCheck | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("compliance_checks")
    .select("*")
    .eq("organization_id", params.organizationId)
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ComplianceCheck | null) ?? null;
}

export function findingsToContentFlags(
  findings: ComplianceFinding[],
): ComplianceFlag[] {
  return findings
    .filter((f) => f.severity === "warning" || f.severity === "critical")
    .map((f) => ({
      severity: f.severity === "critical" ? "critical" : "warning",
      code: f.code,
      message: f.message,
      suggestion: f.suggestion,
    }));
}

export async function runEntityComplianceCheck(params: {
  organizationId: string;
  brandId: string;
  entityType: ComplianceEntityType;
  entityId: string;
  title?: string | null;
  body: string;
  extra?: Record<string, unknown>;
  syncContentFlags?: boolean;
}): Promise<ComplianceCheck> {
  const supabase = createAdminClient();
  const profile = await getOrCreateComplianceProfile({
    organizationId: params.organizationId,
    brandId: params.brandId,
  });

  const deterministic = runDeterministicScan({
    body: params.body,
    bannedTerms: profile.banned_terms ?? [],
    bannedClaims: profile.banned_claims ?? [],
    requiredDisclaimers: profile.required_disclaimers ?? [],
    regulated: profile.regulated,
  });

  // Link allowlist (deterministic) — never invent URLs
  try {
    const { findDisallowedUrls, loadBrandLinkAllowlist } = await import(
      "@/lib/content/link-allowlist"
    );
    const allowlist = await loadBrandLinkAllowlist({
      organizationId: params.organizationId,
      brandId: params.brandId,
    });
    // Merge compliance terms URLs so profile substantiation links are allowed
    const withTerms = Array.from(
      new Set([
        ...allowlist,
        ...((profile.terms_urls as string[] | null) ?? []).filter(Boolean),
      ]),
    );
    const text = `${params.title ?? ""}\n${params.body}`;
    for (const url of findDisallowedUrls(text, withTerms)) {
      deterministic.push({
        severity: "critical",
        code: "disallowed_url",
        message: `Link not on brand allowlist: ${url}`,
        suggestion:
          "Use only the brand website, product URLs, Brand → allowed links, or Compliance → terms URLs. Invented URLs are blocked.",
        rule_id: "link_allowlist",
      });
    }
  } catch {
    // non-blocking if brand lookup fails
  }

  let aiFindings: ComplianceFinding[] = [];
  try {
    const ai = await runComplianceProfileCheck({
      profile,
      entityType: params.entityType,
      title: params.title,
      body: params.body,
      extra: params.extra,
    });
    aiFindings = ai.data.findings;
  } catch (err) {
    aiFindings = [
      {
        severity: "warning",
        code: "checker_unavailable",
        message:
          err instanceof Error
            ? `AI compliance check failed: ${err.message}`
            : "AI compliance check failed",
        suggestion: "Re-run the check before approving.",
      },
    ];
  }

  // Dedupe by code+message
  const merged: ComplianceFinding[] = [];
  const seen = new Set<string>();
  for (const f of [...deterministic, ...aiFindings]) {
    const key = `${f.code}:${f.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(f);
  }

  const status = deriveStatus(merged);
  const { data, error } = await supabase
    .from("compliance_checks")
    .insert({
      organization_id: params.organizationId,
      brand_id: params.brandId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      status,
      findings: merged,
      checked_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to save check");

  if (params.syncContentFlags && params.entityType === "content") {
    await supabase
      .from("content_items")
      .update({ compliance_flags: findingsToContentFlags(merged) })
      .eq("id", params.entityId)
      .eq("organization_id", params.organizationId);
  }

  return data as ComplianceCheck;
}
