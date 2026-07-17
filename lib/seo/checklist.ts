import type { SeoArticleChecklist, SeoContentBrief } from "@/lib/types/seo";

function wordCount(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`\[\]()!-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}

function hasHeading(markdown: string, level: number) {
  const re = new RegExp(`^#{${level}}\\s+.+$`, "m");
  return re.test(markdown);
}

export function scoreArticleAgainstBrief(params: {
  title: string;
  contentMarkdown: string;
  brief: Pick<
    SeoContentBrief,
    | "title"
    | "brief_markdown"
    | "outline"
    | "entities"
    | "internal_links"
    | "target_word_count"
    | "search_intent"
  >;
  keyword: string;
}): SeoArticleChecklist {
  const { title, contentMarkdown, brief, keyword } = params;
  const words = wordCount(contentMarkdown);
  const lower = contentMarkdown.toLowerCase();
  const titleLower = title.toLowerCase();
  const kw = keyword.toLowerCase();

  const checks: SeoArticleChecklist["checks"] = [];

  checks.push({
    id: "keyword_in_title",
    label: "Primary keyword in title",
    passed: titleLower.includes(kw),
    detail: title,
  });

  checks.push({
    id: "keyword_in_intro",
    label: "Primary keyword in first 150 words",
    passed: contentMarkdown.slice(0, 800).toLowerCase().includes(kw),
  });

  const target = brief.target_word_count || 1200;
  const withinRange = words >= target * 0.75 && words <= target * 1.35;
  checks.push({
    id: "word_count",
    label: `Word count near target (${target})`,
    passed: withinRange,
    detail: `${words} words`,
  });

  checks.push({
    id: "has_h2",
    label: "Has H2 sections",
    passed: hasHeading(contentMarkdown, 2),
  });

  const outlineHits = (brief.outline ?? []).filter((item) =>
    lower.includes(item.toLowerCase().slice(0, Math.min(24, item.length))),
  ).length;
  const outlinePass =
    (brief.outline?.length ?? 0) === 0 ||
    outlineHits >= Math.ceil((brief.outline?.length ?? 1) * 0.4);
  checks.push({
    id: "outline_coverage",
    label: "Covers brief outline themes",
    passed: outlinePass,
    detail: `${outlineHits}/${brief.outline?.length ?? 0} outline cues found`,
  });

  const entityHits = (brief.entities ?? []).filter((e) =>
    lower.includes(e.toLowerCase()),
  ).length;
  const entityPass =
    (brief.entities?.length ?? 0) === 0 ||
    entityHits >= Math.ceil((brief.entities?.length ?? 1) * 0.5);
  checks.push({
    id: "entities",
    label: "Mentions required entities",
    passed: entityPass,
    detail: `${entityHits}/${brief.entities?.length ?? 0} entities`,
  });

  const linkHits = (brief.internal_links ?? []).filter((l) =>
    contentMarkdown.includes(l),
  ).length;
  const linkPass =
    (brief.internal_links?.length ?? 0) === 0 || linkHits >= 1;
  checks.push({
    id: "internal_links",
    label: "Includes suggested internal links",
    passed: linkPass,
    detail: `${linkHits} link(s)`,
  });

  checks.push({
    id: "meta_worthy_title",
    label: "Title length suitable for SERP (30–65)",
    passed: title.length >= 30 && title.length <= 65,
    detail: `${title.length} chars`,
  });

  const passed = checks.filter((c) => c.passed).length;
  const score = Math.round((passed / checks.length) * 100);

  return { score, checks };
}
