import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const DEFAULT_MODEL = "claude-sonnet-4-6";

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
  const inputUsd = (inputTokens / 1_000_000) * 3;
  const outputUsd = (outputTokens / 1_000_000) * 15;
  return Math.max(1, Math.round((inputUsd + outputUsd) * 100));
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

  const response = await anthropic.messages.create({
    model,
    max_tokens: params.maxTokens ?? 4096,
    system: params.system,
    ...(params.webSearch
      ? {
          tools: [
            {
              type: "web_search_20250305" as const,
              name: "web_search",
              max_uses: 4,
            } as Anthropic.Messages.ToolUnion,
          ],
        }
      : {}),
    messages: [{ role: "user", content: params.user }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("\n")
    .trim();

  if (!text) throw new Error("Empty model response");

  const data = params.schema.parse(JSON.parse(extractJsonObject(text)));

  return {
    data,
    model,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
    costPence: estimateCostPence(
      response.usage.input_tokens,
      response.usage.output_tokens,
    ),
  };
}
