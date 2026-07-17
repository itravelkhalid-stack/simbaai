export const CONTENT_PROMPT_VERSION = "content-v1";

export const PLATFORM_RULES = `
Platform-native rules (must obey):
- Instagram post: hook in first line, 2,200 char max, 3–8 hashtags, line breaks for scannability.
- Instagram carousel: 5–10 slides; each slide has on_screen_text (<= 12 words) + supporting note.
- Instagram/TikTok reel_script: hook in first 1–2 seconds, shot-by-shot with on_screen_text, voiceover, b-roll notes, then caption + hashtags.
- TikTok: hook-first spoken line, conversational, 1–5 hashtags max, trend-aware but brand-safe.
- X (Twitter): <= 280 chars per post; threads as numbered posts each <= 280.
- LinkedIn: professional tone, short paragraphs, light hashtags (3–5), value-led opener.
- Facebook: conversational, can be longer, light hashtags.
- YouTube short_script: hook, retention beats, CTA, on-screen text cues.
- Pinterest: keyword-rich caption, benefit-led, descriptive rather than slangy.
`;

export const CONTENT_JSON_CONTRACT = `
Return a single JSON object (no markdown fences).
`;
