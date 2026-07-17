import { z } from "zod";

import type {
  ContentFormat,
  ContentPlatform,
} from "@/lib/types/content";

export const complianceFlagSchema = z.object({
  severity: z.enum(["warning", "critical"]),
  code: z.string(),
  message: z.string(),
  suggestion: z.string().optional(),
});

export const contentVariantSchema = z.object({
  label: z.string(),
  title: z.string().optional(),
  copy: z.string(),
  hashtags: z.array(z.string()).default([]),
  structured: z.record(z.string(), z.unknown()).default({}),
  rationale: z.string().optional(),
});

export const singlePostResultSchema = z.object({
  variants: z.array(contentVariantSchema).min(3).max(3),
});

export const batchPlanResultSchema = z.object({
  slots: z
    .array(
      z.object({
        date: z.string(),
        platform: z.enum([
          "instagram",
          "facebook",
          "tiktok",
          "x",
          "linkedin",
          "youtube",
          "pinterest",
        ]),
        format: z.enum([
          "post",
          "carousel",
          "reel_script",
          "story",
          "thread",
          "short_script",
        ]),
        pillar_name: z.string(),
        topic: z.string(),
        rationale: z.string().optional(),
      }),
    )
    .min(1),
});

export const repurposeResultSchema = z.object({
  adaptations: z
    .array(
      z.object({
        platform: z.enum([
          "instagram",
          "facebook",
          "tiktok",
          "x",
          "linkedin",
          "youtube",
          "pinterest",
        ]),
        format: z.enum([
          "post",
          "carousel",
          "reel_script",
          "story",
          "thread",
          "short_script",
        ]),
        title: z.string().optional(),
        copy: z.string(),
        hashtags: z.array(z.string()).default([]),
        structured: z.record(z.string(), z.unknown()).default({}),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

export const scriptResultSchema = z.object({
  title: z.string().optional(),
  caption: z.string(),
  hashtags: z.array(z.string()).default([]),
  structured: z.record(z.string(), z.unknown()),
});

export const complianceResultSchema = z.object({
  flags: z.array(complianceFlagSchema).default([]),
});

export const generateSingleSchema = z.object({
  platform: z.enum([
    "instagram",
    "facebook",
    "tiktok",
    "x",
    "linkedin",
    "youtube",
    "pinterest",
  ]),
  format: z.enum([
    "post",
    "carousel",
    "reel_script",
    "story",
    "thread",
    "short_script",
  ]),
  pillarId: z.string().uuid().optional().or(z.literal("")),
  topic: z.string().trim().min(5).max(2000),
  sourceItemId: z.string().uuid().optional().or(z.literal("")),
  model: z.string().trim().optional().or(z.literal("")),
});

export const generateBatchSchema = z.object({
  title: z.string().trim().min(3).max(160),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  brief: z.string().trim().min(10).max(4000),
  model: z.string().trim().optional().or(z.literal("")),
});

export const updateItemSchema = z.object({
  itemId: z.string().uuid(),
  copy: z.string().optional(),
  title: z.string().optional(),
  hashtags: z.string().optional(),
  scheduledAt: z.string().optional().or(z.literal("")),
});

export const moderationSchema = z.object({
  itemId: z.string().uuid(),
  reason: z.string().trim().max(2000).optional(),
});

export const commentSchema = z.object({
  itemId: z.string().uuid(),
  comment: z.string().trim().min(1).max(2000),
});

export const rescheduleSchema = z.object({
  itemId: z.string().uuid(),
  scheduledAt: z.string().min(1),
});

export const pillarSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  targetPct: z.coerce.number().min(0).max(100),
});

export type GenerateSingleInput = z.infer<typeof generateSingleSchema> & {
  platform: ContentPlatform;
  format: ContentFormat;
};
