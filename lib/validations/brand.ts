import { z } from "zod";

export const brandBasicsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  website: z.string().url().optional().or(z.literal("")),
  tagline: z.string().trim().max(200).optional().or(z.literal("")),
  positioning: z.string().trim().max(2000).optional().or(z.literal("")),
  target_audience: z.string().trim().max(2000).optional().or(z.literal("")),
  allowed_link_urls: z.string().trim().max(4000).optional().or(z.literal("")),
});

export const brandVisualSchema = z.object({
  logo_url: z.string().url().optional().or(z.literal("")),
  primary_color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{3,8}$/)
    .optional()
    .or(z.literal("")),
  secondary_color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{3,8}$/)
    .optional()
    .or(z.literal("")),
  accent_color: z
    .string()
    .regex(/^#?[0-9a-fA-F]{3,8}$/)
    .optional()
    .or(z.literal("")),
  font_heading: z.string().trim().max(80).optional().or(z.literal("")),
  font_body: z.string().trim().max(80).optional().or(z.literal("")),
});

export const brandVoiceSchema = z.object({
  brand_voice: z.string().trim().max(4000).optional().or(z.literal("")),
  tone: z.string().trim().max(500).optional().or(z.literal("")),
  do_say: z.string().trim().max(2000).optional().or(z.literal("")),
  dont_say: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const brandAudienceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  messaging_angles: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const brandProductSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  url: z.string().url().optional().or(z.literal("")),
  price_major: z.coerce.number().min(0).optional(),
});

export const brandExtractSchema = z.object({
  websiteUrl: z.string().url(),
});

export const brandAutonomySchema = z.object({
  brandId: z.string().uuid(),
  autonomy_mode: z.enum(["approval", "autonomous"]),
  agent_activity_paused: z
    .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal("")])
    .optional()
    .transform((v) => v === "on" || v === "true" || v === "1"),
  channel_ads: z.enum(["inherit", "approval", "autonomous"]).default("inherit"),
  channel_organic_social: z
    .enum(["inherit", "approval", "autonomous"])
    .default("inherit"),
  channel_email: z.enum(["inherit", "approval", "autonomous"]).default("inherit"),
  autonomy_min_roas: z.coerce.number().min(0).max(100).default(1.5),
  autonomy_max_cpa_major: z.coerce.number().min(0).max(1_000_000).default(50),
  monthly_ad_budget_major: z.coerce
    .number()
    .min(0)
    .max(100_000_000)
    .optional()
    .nullable(),
  monthly_ad_budget_currency: z.string().trim().min(3).max(3).default("GBP"),
});

export const brandEnabledChannelsSchema = z.object({
  brandId: z.string().uuid(),
  channels: z
    .array(
      z.enum([
        "instagram",
        "facebook",
        "tiktok",
        "x",
        "linkedin",
        "youtube",
        "pinterest",
        "google",
      ]),
    )
    .default([]),
});

export const brandExtractionResultSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().optional().nullable(),
  positioning: z.string().optional().nullable(),
  brand_voice: z.string().optional().nullable(),
  target_audience: z.string().optional().nullable(),
  primary_color: z.string().optional().nullable(),
  secondary_color: z.string().optional().nullable(),
  accent_color: z.string().optional().nullable(),
  font_heading: z.string().optional().nullable(),
  font_body: z.string().optional().nullable(),
  products: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional().nullable(),
        category: z.string().optional().nullable(),
      }),
    )
    .default([]),
  audiences: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional().nullable(),
        messaging_angles: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  guidelines: z
    .object({
      tone: z.string().optional().nullable(),
      do_say: z.array(z.string()).default([]),
      dont_say: z.array(z.string()).default([]),
      value_props: z.array(z.string()).default([]),
    })
    .default({ do_say: [], dont_say: [], value_props: [] }),
});
