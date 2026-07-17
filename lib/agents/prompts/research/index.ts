import { z } from "zod";

import { audienceResearchPrompt } from "@/lib/agents/prompts/research/audience";
import { brandAuditPrompt } from "@/lib/agents/prompts/research/brand-audit";
import { competitorResearchPrompt } from "@/lib/agents/prompts/research/competitor";
import { keywordResearchPrompt } from "@/lib/agents/prompts/research/keyword";
import { marketResearchPrompt } from "@/lib/agents/prompts/research/market";
import { trendResearchPrompt } from "@/lib/agents/prompts/research/trend";
import type { ResearchProjectType } from "@/lib/types/research";

export const researchSourceSchema = z.object({
  title: z.string(),
  url: z.string().url().or(z.string().min(1)),
  note: z.string().optional(),
});

export const researchSectionSchema = z.object({
  section: z.string().min(1),
  content: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
  sources: z.array(researchSourceSchema).default([]),
});

export const researchReportSchema = z.object({
  executive_summary: z.string().min(1),
  recommended_actions: z.array(z.string()).min(1),
  sections: z.array(researchSectionSchema).min(1),
  structured: z.record(z.string(), z.unknown()).default({}),
});

export type ResearchReport = z.infer<typeof researchReportSchema>;

export const RESEARCH_AGENTS = {
  brand_audit: brandAuditPrompt,
  competitor: competitorResearchPrompt,
  market: marketResearchPrompt,
  audience: audienceResearchPrompt,
  keyword: keywordResearchPrompt,
  trend: trendResearchPrompt,
} as const;

export function getResearchAgent(type: ResearchProjectType) {
  return RESEARCH_AGENTS[type];
}
