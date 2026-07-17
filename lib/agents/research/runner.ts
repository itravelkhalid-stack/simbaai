import Anthropic from "@anthropic-ai/sdk";

import {
  getResearchAgent,
  researchReportSchema,
  type ResearchReport,
} from "@/lib/agents/prompts/research";
import type { ResearchProjectType } from "@/lib/types/research";

const DEFAULT_MODEL = "claude-sonnet-4-6";

export type AgentProgressCallback = (update: {
  message: string;
  progress?: number;
}) => Promise<void>;

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("Model response did not contain a JSON object");
  }
  return candidate.slice(start, end + 1);
}

function estimateCostPence(inputTokens: number, outputTokens: number) {
  // Approximate Sonnet pricing stored as integer pence for org cost tracking.
  const inputUsd = (inputTokens / 1_000_000) * 3;
  const outputUsd = (outputTokens / 1_000_000) * 15;
  return Math.max(1, Math.round((inputUsd + outputUsd) * 100));
}

export async function runResearchClaudeAgent(params: {
  type: ResearchProjectType;
  model?: string;
  context: {
    organizationName: string;
    brandName: string;
    website?: string | null;
    positioning?: string | null;
    brandVoice?: string | null;
    targetAudience?: string | null;
    socialHandles?: Record<string, unknown> | null;
    priorResearchMarkdown?: string | null;
    brief: string;
    competitorUrls?: string[];
    discoverTop5?: boolean;
  };
  onProgress?: AgentProgressCallback;
}): Promise<{
  report: ResearchReport;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costPence: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const model = params.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const agent = getResearchAgent(params.type);
  const anthropic = new Anthropic({ apiKey });

  await params.onProgress?.({
    message: `Starting ${agent.agentName} with web search (${model})`,
    progress: 5,
  });

  const userPrompt =
    params.type === "competitor"
      ? (
          agent as typeof import("@/lib/agents/prompts/research/competitor").competitorResearchPrompt
        ).buildUserPrompt({
          ...params.context,
          competitorUrls: params.context.competitorUrls ?? [],
          discoverTop5: params.context.discoverTop5 ?? true,
        })
      : (
          agent as {
            buildUserPrompt: (ctx: typeof params.context) => string;
          }
        ).buildUserPrompt(params.context);

  let tokensIn = 0;
  let tokensOut = 0;

  // Anthropic web search tool — enables live research for public sources.
  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: agent.system,
    tools: [
      {
        // Web search tool type from Anthropic Messages API
        type: "web_search_20250305" as const,
        name: "web_search",
        max_uses: 8,
      } as Anthropic.Messages.ToolUnion,
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  tokensIn += response.usage.input_tokens;
  tokensOut += response.usage.output_tokens;

  await params.onProgress?.({
    message: "Model finished tool-assisted research; validating structured report",
    progress: 85,
  });

  const textBlocks = response.content.filter((block) => block.type === "text");
  const text = textBlocks
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  if (!text) {
    throw new Error("Empty model response");
  }

  const parsed = researchReportSchema.parse(JSON.parse(extractJsonObject(text)));

  return {
    report: parsed,
    model,
    tokensIn,
    tokensOut,
    costPence: estimateCostPence(tokensIn, tokensOut),
  };
}
