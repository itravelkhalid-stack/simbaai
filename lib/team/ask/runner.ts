import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import {
  zodSchemaToToolInputSchema,
} from "@/lib/agents/claude-json";
import { teamAskPrompt } from "@/lib/agents/prompts/team/ask";
import {
  ASK_FINAL_SCHEMA,
  buildAskTools,
  executeAskTool,
  type AskFinalResult,
  type AskToolContext,
} from "@/lib/team/ask/tools";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const STRUCTURED_TOOL_NAME = "emit_structured_result";
const MAX_TURNS = 10;

function estimateCostPence(inputTokens: number, outputTokens: number) {
  const inputUsd = (inputTokens / 1_000_000) * 3;
  const outputUsd = (outputTokens / 1_000_000) * 15;
  return Math.max(1, Math.round((inputUsd + outputUsd) * 100));
}

function structuredResultTool(): Anthropic.Messages.Tool {
  return {
    name: STRUCTURED_TOOL_NAME,
    description:
      "Return the final answer. Call this when you have enough tool results.",
    input_schema: zodSchemaToToolInputSchema(ASK_FINAL_SCHEMA),
  };
}

export type AskHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function runTeamAsk(params: {
  organizationId: string;
  brandId: string;
  userId: string;
  question: string;
  history: AskHistoryMessage[];
}): Promise<{
  result: AskFinalResult;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costPence: number;
  agentRunId: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const anthropic = new Anthropic({ apiKey });
  const ctx: AskToolContext = {
    organizationId: params.organizationId,
    brandId: params.brandId,
    userId: params.userId,
  };

  const admin = createAdminClient();
  const { data: runRow, error: runErr } = await admin
    .from("agent_runs")
    .insert({
      organization_id: params.organizationId,
      module: "team",
      agent_name: teamAskPrompt.agentName,
      status: "running",
      model,
      input: {
        brand_id: params.brandId,
        question: params.question,
        prompt_version: teamAskPrompt.version,
      },
      progress: 5,
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    throw new Error(runErr?.message ?? "Failed to start agent run");
  }
  const agentRunId = runRow.id as string;

  const tools: Anthropic.Messages.ToolUnion[] = [
    ...buildAskTools(),
    structuredResultTool(),
  ];

  const messages: Anthropic.Messages.MessageParam[] = [
    ...params.history.slice(-12).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: params.question },
  ];

  let tokensIn = 0;
  let tokensOut = 0;

  try {
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        system: `${teamAskPrompt.system}

When ready to answer the user, call "${STRUCTURED_TOOL_NAME}" with answer_markdown, department, and actions_summary.`,
        tools,
        tool_choice: { type: "auto" },
        messages,
      });

      tokensIn += response.usage.input_tokens;
      tokensOut += response.usage.output_tokens;

      const toolUses = response.content.filter(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
      );

      const finalCall = toolUses.find((t) => t.name === STRUCTURED_TOOL_NAME);
      if (finalCall) {
        const parsed = ASK_FINAL_SCHEMA.parse(finalCall.input);
        const costPence = estimateCostPence(tokensIn, tokensOut);
        await admin
          .from("agent_runs")
          .update({
            status: "complete",
            output: parsed,
            tokens_in: tokensIn,
            tokens_out: tokensOut,
            cost_pence: costPence,
            progress: 100,
            duration_ms: null,
          })
          .eq("id", agentRunId);
        return {
          result: parsed,
          model,
          tokensIn,
          tokensOut,
          costPence,
          agentRunId,
        };
      }

      if (toolUses.length === 0) {
        // Model replied in text — force structured emit next turn
        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: `Call ${STRUCTURED_TOOL_NAME} now with your complete answer. Do not reply in plain text.`,
        });
        continue;
      }

      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        try {
          const result = await executeAskTool(use.name, use.input, ctx);
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify(result).slice(0, 24_000),
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: use.id,
            content: JSON.stringify({
              error: err instanceof Error ? err.message : "Tool failed",
            }),
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error("Ask the Team exceeded tool turns without a final answer");
  } catch (error) {
    const costPence = estimateCostPence(tokensIn, tokensOut);
    await admin
      .from("agent_runs")
      .update({
        status: "failed",
        error: error instanceof Error ? error.message : "Ask failed",
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        cost_pence: costPence,
        progress: 100,
      })
      .eq("id", agentRunId);
    throw error;
  }
}

/** Rate limit: max Ask sessions per org per rolling hour (cost guard). */
export async function assertAskRateLimit(params: {
  organizationId: string;
  userId: string;
  limit?: number;
}) {
  void params.userId;
  const limit = params.limit ?? 40;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const admin = createAdminClient();

  const { count: runCount } = await admin
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", params.organizationId)
    .eq("agent_name", "team_ask")
    .gte("created_at", since);

  if ((runCount ?? 0) >= limit) {
    throw new Error(
      `Rate limit: max ${limit} Ask the Team sessions per hour. Try again later.`,
    );
  }
}

