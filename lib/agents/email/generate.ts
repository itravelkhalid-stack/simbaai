import { z } from "zod";

import {
  campaignGeneratePrompt,
  flowStrategyPrompt,
  flowWritePrompt,
} from "@/lib/agents/prompts/email/campaign";
import { runClaudeJson } from "@/lib/agents/claude-json";
import { createBlock } from "@/lib/email/blocks";
import type { BrandContext } from "@/lib/brand/context";
import type { EmailBlock } from "@/lib/types/email";

const blockSchema = z.object({
  type: z.enum(["heading", "text", "image", "button", "divider", "product"]),
  content: z.record(z.string(), z.string()).default({}),
});

const campaignSchema = z.object({
  subject_variants: z.array(z.string()).min(1),
  preheader: z.string(),
  blocks: z.array(blockSchema).min(1),
  plain_text_summary: z.string().optional(),
});

const flowStrategySchema = z.object({
  name: z.string(),
  strategy_summary: z.string(),
  emails: z
    .array(
      z.object({
        position: z.number(),
        delay_hours: z.number(),
        goal: z.string(),
        subject: z.string(),
        preheader: z.string(),
        angle: z.string(),
      }),
    )
    .min(1),
});

const flowWriteSchema = z.object({
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(blockSchema).min(1),
});

function toBlocks(raw: z.infer<typeof blockSchema>[]): EmailBlock[] {
  return raw.map((item) => {
    const base = createBlock(item.type);
    return { ...base, content: { ...base.content, ...item.content } };
  });
}

export async function generateCampaignEmail(input: {
  brandContext: BrandContext;
  brief: string;
  model?: string;
}) {
  const result = await runClaudeJson({
    system: campaignGeneratePrompt.system,
    user: `${input.brandContext.markdown}

## Campaign brief
${input.brief}

Write the email as JSON.`,
    schema: campaignSchema,
    model: input.model,
    maxTokens: 4000,
  });

  return {
    ...result,
    data: {
      ...result.data,
      blocks: toBlocks(result.data.blocks),
    },
  };
}

export async function proposeEmailFlow(input: {
  brandContext: BrandContext;
  brief: string;
  emailCount?: number;
  model?: string;
}) {
  const count = input.emailCount ?? 5;
  return runClaudeJson({
    system: flowStrategyPrompt.system,
    user: `${input.brandContext.markdown}

## Flow brief
${input.brief}

Propose a ${count}-email sequence strategy as JSON.`,
    schema: flowStrategySchema,
    model: input.model,
    maxTokens: 3000,
  });
}

export async function writeFlowEmail(input: {
  brandContext: BrandContext;
  strategySummary: string;
  email: {
    position: number;
    goal: string;
    subject: string;
    preheader: string;
    angle: string;
  };
  model?: string;
}) {
  const result = await runClaudeJson({
    system: flowWritePrompt.system,
    user: `${input.brandContext.markdown}

## Sequence strategy
${input.strategySummary}

## This email
${JSON.stringify(input.email)}

Write this email as JSON blocks.`,
    schema: flowWriteSchema,
    model: input.model,
    maxTokens: 3500,
  });

  return {
    ...result,
    data: {
      ...result.data,
      blocks: toBlocks(result.data.blocks),
    },
  };
}
