export const BRAND_GUIDELINES_PDF_PROMPT_VERSION = "brand_guidelines_pdf_v1";

export function brandGuidelinesPdfSystemPrompt() {
  return `You extract structured brand guidelines from a PDF brand book / style guide.

Return ONLY a JSON object matching this shape:
{
  "primary_color": "#RRGGBB or null",
  "secondary_color": "#RRGGBB or null",
  "accent_color": "#RRGGBB or null",
  "font_heading": "font family name or null",
  "font_body": "font family name or null",
  "brand_voice": "1-3 paragraph voice summary or null",
  "guidelines": {
    "tone": "short tone description or null",
    "do_say": ["phrases / words to prefer"],
    "dont_say": ["phrases / words to avoid"],
    "value_props": ["key value propositions"],
    "vocabulary": ["important brand vocabulary terms"],
    "summary": "2-4 sentence digest of the guidelines"
  }
}

Rules:
- Prefer hex colors when present; otherwise leave null.
- Prefer concrete do/don't lists over vague prose.
- Do not invent colors or fonts that are not in the document.
- If a field is absent, use null or [].`;
}

export function brandGuidelinesPdfUserPrompt(filename: string) {
  return `Extract brand guidelines from this PDF (${filename}). Respond with JSON only.`;
}
