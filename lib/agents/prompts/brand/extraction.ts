export const BRAND_EXTRACTION_PROMPT_VERSION = "brand-extraction@2026-07-22";

export function brandExtractionSystemPrompt() {
  return `You are a brand strategist extracting a usable brand kit from a company website.
Return ONLY valid JSON matching the schema. Prefer concise, actionable copy.
If something is unknown, use null or empty arrays — do not invent fake products.
Colors should be hex when possible (e.g. #0F172A).`;
}

export function brandExtractionUserPrompt(websiteUrl: string, pageText: string) {
  return `Website URL: ${websiteUrl}

Fetched page text (truncated):
${pageText.slice(0, 12000)}

Extract JSON with keys:
{
  "name": string,
  "tagline": string|null,
  "positioning": string|null,
  "brand_voice": string|null,
  "target_audience": string|null,
  "primary_color": string|null,
  "secondary_color": string|null,
  "accent_color": string|null,
  "font_heading": string|null,
  "font_body": string|null,
  "products": [{"name": string, "description": string|null, "category": string|null}],
  "audiences": [{"name": string, "description": string|null, "messaging_angles": string[]}],
  "guidelines": {"tone": string|null, "do_say": string[], "dont_say": string[], "value_props": string[]}
}`;
}
