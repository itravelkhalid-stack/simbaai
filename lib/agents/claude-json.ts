import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const STRUCTURED_TOOL_NAME = "emit_structured_result";

function estimateCostPence(inputTokens: number, outputTokens: number) {
  const inputUsd = (inputTokens / 1_000_000) * 3;
  const outputUsd = (outputTokens / 1_000_000) * 15;
  return Math.max(1, Math.round((inputUsd + outputUsd) * 100));
}

/**
 * Convert a Zod schema to an Anthropic tool `input_schema`.
 *
 * Uses Zod 4's native `z.toJSONSchema`. The `zod-to-json-schema` package
 * (v3) returns empty/unusable schemas for Zod 4 — do not use it here.
 */
export function zodSchemaToToolInputSchema(
  schema: z.ZodType,
): Anthropic.Messages.Tool.InputSchema {
  const raw = z.toJSONSchema(schema) as Record<string, unknown>;
  // Anthropic rejects draft $schema and expects a plain object schema.
  const { $schema: _schema, ...rest } = raw;
  if (rest.type !== "object") {
    throw new Error("Structured output schema must be a Zod object");
  }
  return rest as Anthropic.Messages.Tool.InputSchema;
}

function structuredResultTool(schema: z.ZodType): Anthropic.Messages.Tool {
  return {
    name: STRUCTURED_TOOL_NAME,
    description:
      "Return the final structured result. You MUST call this tool with the COMPLETE result — every required field must be present. Do not reply with freeform JSON text.",
    input_schema: zodSchemaToToolInputSchema(schema),
  };
}

function extractToolInput(
  content: Anthropic.Messages.ContentBlock[],
  toolName: string,
): Record<string, unknown> | null {
  for (const block of content) {
    if (block.type === "tool_use" && block.name === toolName) {
      return block.input as Record<string, unknown>;
    }
  }
  return null;
}

function formatZodIssues(err: z.ZodError) {
  return err.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

export async function runClaudeJson<T>(params: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  model?: string;
  maxTokens?: number;
  webSearch?: boolean;
}): Promise<{
  data: T;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costPence: number;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const model = params.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const anthropic = new Anthropic({ apiKey });
  const emitTool = structuredResultTool(params.schema);

  const tools: Anthropic.Messages.ToolUnion[] = params.webSearch
    ? [
        {
          type: "web_search_20250305" as const,
          name: "web_search",
          max_uses: 4,
        } as Anthropic.Messages.ToolUnion,
        emitTool,
      ]
    : [emitTool];

  const toolChoice: Anthropic.Messages.ToolChoice = params.webSearch
    ? { type: "auto" }
    : { type: "tool", name: STRUCTURED_TOOL_NAME };

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: params.user },
  ];

  let tokensIn = 0;
  let tokensOut = 0;
  let lastStopReason: string | null = null;
  let lastToolInput: Record<string, unknown> | null = null;
  let lastZodError: z.ZodError | null = null;

  // Turns: web-search loop + optional max_tokens continuation after a truncated tool call.
  const maxTurns = (params.webSearch ? 6 : 1) + 2;
  let baseMaxTokens = params.maxTokens ?? 4096;

  for (let turn = 0; turn < maxTurns; turn++) {
    const forceEmit =
      (!params.webSearch && turn === 0) ||
      (params.webSearch && turn >= 5) ||
      turn > 0;

    const response = await anthropic.messages.create({
      model,
      max_tokens: baseMaxTokens,
      system: `${params.system}

You must call the tool "${STRUCTURED_TOOL_NAME}" with the COMPLETE result matching its input_schema. Every required field must be included. Do not return the result as plain text.`,
      tools,
      tool_choice: forceEmit
        ? { type: "tool", name: STRUCTURED_TOOL_NAME }
        : toolChoice,
      messages,
    });

    tokensIn += response.usage.input_tokens;
    tokensOut += response.usage.output_tokens;
    lastStopReason = response.stop_reason;

    const toolInput = extractToolInput(response.content, STRUCTURED_TOOL_NAME);
    if (toolInput) {
      lastToolInput = toolInput;
      try {
        const data = params.schema.parse(toolInput);
        return {
          data,
          model,
          tokensIn,
          tokensOut,
          costPence: estimateCostPence(tokensIn, tokensOut),
        };
      } catch (err) {
        if (err instanceof z.ZodError) {
          lastZodError = err;
          // Truncated tool JSON typically drops trailing required fields.
          if (
            response.stop_reason === "max_tokens" &&
            turn < maxTurns - 1
          ) {
            baseMaxTokens = Math.min(baseMaxTokens + 8000, 24000);
            messages.push({ role: "assistant", content: response.content });
            messages.push({
              role: "user",
              content: `Your previous "${STRUCTURED_TOOL_NAME}" call was truncated (stop_reason=max_tokens) and failed validation: ${formatZodIssues(err)}.
Call "${STRUCTURED_TOOL_NAME}" again with the COMPLETE object. Include every required field (especially any that were missing). Do not omit trailing arrays.`,
            });
            continue;
          }
          throw new Error(
            `Structured output failed Zod validation (stop_reason=${response.stop_reason ?? "unknown"}): ${formatZodIssues(err)}`,
          );
        }
        throw err;
      }
    }

    // No tool call yet — continue (web search or truncated mid-stream without parseable input).
    if (turn < maxTurns - 1) {
      if (response.stop_reason === "max_tokens") {
        baseMaxTokens = Math.min(baseMaxTokens + 8000, 24000);
      }
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content:
          response.stop_reason === "max_tokens"
            ? `Output was truncated (max_tokens). Call "${STRUCTURED_TOOL_NAME}" now with the COMPLETE structured result including all required fields.`
            : `Continue. When ready, call the "${STRUCTURED_TOOL_NAME}" tool with the complete structured result. Do not answer in plain text.`,
      });
      continue;
    }
  }

  if (lastZodError && lastToolInput) {
    throw new Error(
      `Structured output failed Zod validation after retries (stop_reason=${lastStopReason ?? "unknown"}): ${formatZodIssues(lastZodError)}`,
    );
  }

  throw new Error(
    `Model did not call ${STRUCTURED_TOOL_NAME} (structured output required; stop_reason=${lastStopReason ?? "unknown"})`,
  );
}
