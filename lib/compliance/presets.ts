import type {
  ComplianceIndustryPreset,
  ComplianceRule,
} from "@/lib/types/compliance";

function rule(
  id: string,
  label: string,
  description: string,
  severity: ComplianceRule["severity"] = "warning",
): ComplianceRule {
  return { id, label, description, severity, enabled: true };
}

const SHARED_RULES: ComplianceRule[] = [
  rule(
    "misleading_claims",
    "Misleading claims",
    "Claims must be truthful and not likely to mislead the average consumer.",
    "critical",
  ),
  rule(
    "unsubstantiated_superlatives",
    "Unsubstantiated superlatives",
    "Avoid 'best', '#1', 'guaranteed' etc. without evidence or qualification.",
    "critical",
  ),
  rule(
    "missing_disclaimers",
    "Required disclaimers",
    "Required legal/marketing disclaimers must appear where claims need qualification.",
    "critical",
  ),
  rule(
    "before_after",
    "Before/after claims",
    "Before/after or transformation claims need substantiation and fair presentation.",
    "warning",
  ),
  rule(
    "pricing_clarity",
    "Pricing clarity",
    "Prices, discounts, and material conditions must be clear and not hide fees.",
    "warning",
  ),
];

export type IndustryPresetPack = {
  industry: ComplianceIndustryPreset;
  regulated: boolean;
  jurisdictions: string[];
  required_disclaimers: string[];
  banned_claims: string[];
  banned_terms: string[];
  rules: ComplianceRule[];
};

export const INDUSTRY_PRESETS: Record<
  Exclude<ComplianceIndustryPreset, "custom">,
  IndustryPresetPack
> = {
  general_ecommerce: {
    industry: "general_ecommerce",
    regulated: false,
    jurisdictions: ["UK", "EU"],
    required_disclaimers: [],
    banned_claims: ["miracle results", "risk-free forever"],
    banned_terms: [],
    rules: SHARED_RULES,
  },
  financial_promotions: {
    industry: "financial_promotions",
    regulated: true,
    jurisdictions: ["UK"],
    required_disclaimers: [
      "Capital at risk. Past performance is not a reliable indicator of future results.",
      "This is not personal financial advice.",
    ],
    banned_claims: [
      "guaranteed returns",
      "risk-free investment",
      "get rich quick",
      "no risk",
    ],
    banned_terms: ["guaranteed profit", "sure thing"],
    rules: [
      ...SHARED_RULES,
      rule(
        "financial_risk_warning",
        "Financial risk warning",
        "Include capital-at-risk / past performance warnings for promotions.",
        "critical",
      ),
      rule(
        "no_advice_implication",
        "No advice implication",
        "Do not imply personalised financial advice unless authorised.",
        "critical",
      ),
    ],
  },
  health_wellness: {
    industry: "health_wellness",
    regulated: true,
    jurisdictions: ["UK", "EU"],
    required_disclaimers: [
      "This is not medical advice. Consult a healthcare professional.",
    ],
    banned_claims: [
      "cures",
      "treats disease",
      "clinically proven" /* without evidence */,
      "FDA approved",
    ],
    banned_terms: ["miracle cure", "detox toxin"],
    rules: [
      ...SHARED_RULES,
      rule(
        "medical_claims",
        "Medical claims",
        "Do not claim to diagnose, treat, cure, or prevent disease without authorisation.",
        "critical",
      ),
      rule(
        "testimonial_balance",
        "Testimonial balance",
        "Testimonials must not imply typical results without qualification.",
        "warning",
      ),
    ],
  },
  alcohol: {
    industry: "alcohol",
    regulated: true,
    jurisdictions: ["UK"],
    required_disclaimers: [
      "Please drink responsibly. 18+ only.",
    ],
    banned_claims: [
      "improves performance",
      "therapeutic",
      "essential for success",
    ],
    banned_terms: [],
    rules: [
      ...SHARED_RULES,
      rule(
        "alcohol_age_gate",
        "Age restriction",
        "Must not appeal to under-18s; include 18+ / drink responsibly where required.",
        "critical",
      ),
      rule(
        "alcohol_excess",
        "No excess promotion",
        "Do not encourage excessive or irresponsible drinking.",
        "critical",
      ),
    ],
  },
  childrens_products: {
    industry: "childrens_products",
    regulated: true,
    jurisdictions: ["UK", "EU"],
    required_disclaimers: [
      "Adult supervision recommended where applicable.",
    ],
    banned_claims: [
      "makes kids smarter overnight",
      "safe for unsupervised use" /* when not true */,
    ],
    banned_terms: [],
    rules: [
      ...SHARED_RULES,
      rule(
        "child_safety",
        "Child safety",
        "Do not encourage unsafe behaviour; age suitability must be clear.",
        "critical",
      ),
      rule(
        "no_pressure_sell_kids",
        "No pressure selling to children",
        "Avoid direct exhortation to children to buy or persuade parents.",
        "critical",
      ),
    ],
  },
};

export function getPresetPack(
  industry: ComplianceIndustryPreset,
): IndustryPresetPack {
  if (industry === "custom") {
    return {
      industry: "custom",
      regulated: false,
      jurisdictions: [],
      required_disclaimers: [],
      banned_claims: [],
      banned_terms: [],
      rules: SHARED_RULES.map((r) => ({ ...r })),
    };
  }
  const pack = INDUSTRY_PRESETS[industry];
  return {
    ...pack,
    jurisdictions: [...pack.jurisdictions],
    required_disclaimers: [...pack.required_disclaimers],
    banned_claims: [...pack.banned_claims],
    banned_terms: [...pack.banned_terms],
    rules: pack.rules.map((r) => ({ ...r })),
  };
}
