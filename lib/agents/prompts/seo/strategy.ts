import { z } from "zod";

export const keywordMapSchema = z.object({
  notes: z.string().optional().default(""),
  pillars: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        primary_keyword: z.string(),
        clusters: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            keywords: z.array(z.string()).min(1),
          }),
        ),
      }),
    )
    .min(1),
});

export const contentBriefSchema = z.object({
  title: z.string(),
  search_intent: z.string(),
  target_word_count: z.number().int().positive(),
  outline: z.array(z.string()).min(3),
  entities: z.array(z.string()).default([]),
  internal_links: z.array(z.string()).default([]),
  brief_markdown: z.string(),
});

export const articleDraftSchema = z.object({
  title: z.string(),
  content_markdown: z.string().min(200),
});

export const weeklySummarySchema = z.object({
  summary_markdown: z.string(),
  highlights: z.array(z.string()).default([]),
});

export const seoKeywordStrategyPrompt = {
  system: `You are Simba AI SEO Keyword Strategist. Produce a pillar/cluster keyword map as JSON only.
Use brand context, competitors, and GSC query data when provided. Prefer realistic commercial intent mix.
Each pillar needs an id (slug), name, primary_keyword, and clusters with keyword arrays.`,
};

export const seoBriefPrompt = {
  system: `You are Simba AI SEO Content Brief agent. Write a structured SEO brief as JSON only.
Include search intent, outline, entities to cover, internal link suggestions, target word count, and a markdown brief body.`,
};

export const seoArticlePrompt = {
  system: `You are Simba AI SEO Article writer. Draft long-form markdown in brand voice as JSON only.
Follow the brief outline and entities. Use H2/H3 headings. Do not invent fake citations.`,
};

export const seoWeeklySummaryPrompt = {
  system: `You are Simba AI SEO Analyst. Write a weekly SEO summary for leadership/reviews as JSON only.
Cover wins, losses, keyword movement, technical issues, and next actions. Markdown summary + highlights array.`,
};
