import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { zodSchemaToToolInputSchema } from "@/lib/agents/claude-json";

const DEFAULT_MODEL = "claude-sonnet-4-6";
const STRUCTURED_TOOL_NAME = "emit_structured_result";

function estimateCostPence(inputTokens: number, outputTokens: number) {
  const inputUsd = (inputTokens / 1_000_000) * 3;
  const outputUsd = (outputTokens / 1_000_000) * 15;
  return Math.max(1, Math.round((inputUsd + outputUsd) * 100));
}

export type ClaudeImageMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

/** Claude structured JSON with an image attachment (base64). */
export async function runClaudeJsonWithImage<T>(params: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  imageBase64: string;
  mediaType: ClaudeImageMediaType;
  model?: string;
  maxTokens?: number;
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

  const response = await anthropic.messages.create({
    model,
    max_tokens: params.maxTokens ?? 1024,
    system: `${params.system}

You must call the tool "${STRUCTURED_TOOL_NAME}" with the complete result matching its input_schema. Do not return the result as plain text.`,
    tools: [
      {
        name: STRUCTURED_TOOL_NAME,
        description:
          "Return the final structured result. You MUST call this tool with the complete result — do not reply with freeform JSON text.",
        input_schema: zodSchemaToToolInputSchema(params.schema),
      },
    ],
    tool_choice: { type: "tool", name: STRUCTURED_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: params.mediaType,
              data: params.imageBase64,
            },
          },
          { type: "text", text: params.user },
        ],
      },
    ],
  });

  const toolBlock = response.content.find(
    (block) =>
      block.type === "tool_use" && block.name === STRUCTURED_TOOL_NAME,
  );
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error(
      `Model did not call ${STRUCTURED_TOOL_NAME} (structured output required)`,
    );
  }

  const data = params.schema.parse(toolBlock.input);
  const tokensIn = response.usage.input_tokens;
  const tokensOut = response.usage.output_tokens;

  return {
    data,
    model,
    tokensIn,
    tokensOut,
    costPence: estimateCostPence(tokensIn, tokensOut),
  };
}
