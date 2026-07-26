import {
  getResearchAgent,
  researchReportSchema,
  type ResearchReport,
} from "@/lib/agents/prompts/research";
import { runClaudeJson } from "@/lib/agents/claude-json";
import type { ResearchProjectType } from "@/lib/types/research";

export type AgentProgressCallback = (update: {
  message: string;
  progress?: number;
}) => Promise<void>;

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
  const agent = getResearchAgent(params.type);

  await params.onProgress?.({
    message: `Starting ${agent.agentName} with structured output + web search`,
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

  const result = await runClaudeJson({
    system: agent.system,
    user: userPrompt,
    schema: researchReportSchema,
    model: params.model,
    maxTokens: 12000,
    webSearch: true,
  });

  await params.onProgress?.({
    message: "Validated structured research report",
    progress: 85,
  });

  return {
    report: result.data,
    model: result.model,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    costPence: result.costPence,
  };
}
