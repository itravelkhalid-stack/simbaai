/**
 * Title/topic near-duplicate detection for content scheduling & fill.
 * Rejects variants that are too similar to recent published/scheduled work.
 */

const STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "your",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "how",
  "why",
  "what",
  "when",
  "who",
  "our",
  "out",
  "not",
  "but",
  "can",
  "its",
  "it's",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "is",
  "it",
  "or",
  "as",
  "at",
  "be",
  "by",
  "if",
  "so",
  "we",
  "vs",
]);

export function normalizeTopicText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function topicTokens(raw: string): string[] {
  return normalizeTopicText(raw)
    .split(" ")
    .filter((t) => t.length > 2 && !STOP.has(t));
}

/** Jaccard similarity over meaningful tokens (0–1). */
export function topicTokenSimilarity(a: string, b: string): number {
  const ta = new Set(topicTokens(a));
  const tb = new Set(topicTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * True when candidate shares a long contiguous phrase (≥3 words after normalize)
 * with existing, or token Jaccard ≥ threshold.
 */
export function isNearDuplicateTopic(
  candidate: string,
  existing: string,
  threshold = 0.55,
): boolean {
  const na = normalizeTopicText(candidate);
  const nb = normalizeTopicText(existing);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Contained substantial phrase
  if (na.length >= 12 && nb.includes(na)) return true;
  if (nb.length >= 12 && na.includes(nb)) return true;

  const aWords = na.split(" ");
  if (aWords.length >= 3) {
    for (let i = 0; i <= aWords.length - 3; i++) {
      const phrase = aWords.slice(i, i + 3).join(" ");
      if (phrase.length >= 10 && nb.includes(phrase)) return true;
    }
  }

  return topicTokenSimilarity(candidate, existing) >= threshold;
}

export function findSimilarTopic(
  candidate: string,
  existingTitles: Array<{ id?: string; title: string }>,
  threshold = 0.55,
): { id?: string; title: string; score: number } | null {
  let best: { id?: string; title: string; score: number } | null = null;
  for (const row of existingTitles) {
    if (!row.title?.trim()) continue;
    if (!isNearDuplicateTopic(candidate, row.title, threshold)) continue;
    const score = Math.max(
      topicTokenSimilarity(candidate, row.title),
      isNearDuplicateTopic(candidate, row.title, threshold) ? 0.55 : 0,
    );
    if (!best || score > best.score) {
      best = { id: row.id, title: row.title, score };
    }
  }
  return best;
}
