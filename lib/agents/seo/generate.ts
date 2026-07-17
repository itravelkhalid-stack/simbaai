import { runClaudeJson } from "@/lib/agents/claude-json";
import {
  articleDraftSchema,
  contentBriefSchema,
  keywordMapSchema,
  seoArticlePrompt,
  seoBriefPrompt,
  seoKeywordStrategyPrompt,
  seoWeeklySummaryPrompt,
  weeklySummarySchema,
} from "@/lib/agents/prompts/seo/strategy";
import type { BrandContext } from "@/lib/brand/context";

export async function generateKeywordMap(input: {
  brandContext: BrandContext;
  domain: string;
  gscQueriesMarkdown?: string;
  competitorNotes?: string;
  model?: string;
}) {
  return runClaudeJson({
    system: seoKeywordStrategyPrompt.system,
    user: `${input.brandContext.markdown}

## Domain
${input.domain}

${input.competitorNotes ? `## Competitors\n${input.competitorNotes}\n` : ""}
${input.gscQueriesMarkdown ? `## GSC top queries\n${input.gscQueriesMarkdown}\n` : ""}

Return JSON:
{
  "notes": string,
  "pillars": [{
    "id": string,
    "name": string,
    "primary_keyword": string,
    "clusters": [{ "id": string, "name": string, "keywords": string[] }]
  }]
}`,
    schema: keywordMapSchema,
    model: input.model,
    maxTokens: 4500,
  });
}

export async function generateSeoBrief(input: {
  brandContext: BrandContext;
  keyword: string;
  intent?: string | null;
  domain: string;
  model?: string;
}) {
  return runClaudeJson({
    system: seoBriefPrompt.system,
    user: `${input.brandContext.markdown}

## Target keyword
${input.keyword}
Intent hint: ${input.intent ?? "unknown"}
Domain: ${input.domain}

Return JSON with title, search_intent, target_word_count, outline[], entities[], internal_links[], brief_markdown.`,
    schema: contentBriefSchema,
    model: input.model,
    maxTokens: 3500,
  });
}

export async function generateSeoArticle(input: {
  brandContext: BrandContext;
  briefMarkdown: string;
  keyword: string;
  outline: string[];
  entities: string[];
  targetWordCount: number;
  model?: string;
}) {
  return runClaudeJson({
    system: seoArticlePrompt.system,
    user: `${input.brandContext.markdown}

## Keyword
${input.keyword}
Target words: ${input.targetWordCount}
Outline: ${input.outline.join(" | ")}
Entities: ${input.entities.join(", ")}

## Brief
${input.briefMarkdown}

Return JSON: { "title": string, "content_markdown": string }`,
    schema: articleDraftSchema,
    model: input.model,
    maxTokens: 8000,
  });
}

export async function generateWeeklySeoSummary(input: {
  brandContext: BrandContext;
  domain: string;
  performanceMarkdown: string;
  model?: string;
}) {
  return runClaudeJson({
    system: seoWeeklySummaryPrompt.system,
    user: `${input.brandContext.markdown}

## Domain
${input.domain}

## Week performance
${input.performanceMarkdown}

Return JSON: { "summary_markdown": string, "highlights": string[] }`,
    schema: weeklySummarySchema,
    model: input.model,
    maxTokens: 3000,
  });
}
