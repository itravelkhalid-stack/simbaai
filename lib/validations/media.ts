import { z } from "zod";

export const mediaUploadMetaSchema = z.object({
  brandId: z.string().uuid(),
  tags: z.string().optional(),
  reservedTag: z.string().optional(),
  type: z
    .enum(["image", "video", "logo", "document", "font"])
    .optional(),
});

/** Register a file already uploaded to brand-media (path + metadata only). */
export const registerUploadedMediaSchema = z.object({
  brandId: z.string().uuid(),
  storagePath: z
    .string()
    .min(10)
    .max(500)
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/.+/i,
      "Invalid storage path",
    ),
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive().max(25 * 1024 * 1024),
  tags: z.string().optional(),
  reservedTag: z.string().optional(),
  type: z
    .enum(["image", "video", "logo", "document", "font"])
    .optional(),
});

export const mediaUpdateTagsSchema = z.object({
  assetId: z.string().uuid(),
  tags: z.string().max(500),
});

export const mediaDeleteSchema = z.object({
  assetId: z.string().uuid(),
});

export const attachContentMediaSchema = z.object({
  itemId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const replaceContentMediaSchema = z.object({
  itemId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const detachContentMediaSchema = z.object({
  itemId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const mediaVisionTagSchema = z.object({
  subject: z.string().min(1).max(120),
  style: z.string().min(1).max(120),
  colors: z.array(z.string()).max(8).default([]),
  description: z.string().min(1).max(400),
  tags: z.array(z.string()).max(20).default([]),
  suitable_for: z.array(z.string()).max(12).default([]),
});

export const guidelinesProposalActionSchema = z.object({
  proposalId: z.string().uuid(),
});

/** Structured extraction from a brand guidelines PDF */
export const guidelinesPdfExtractionSchema = z.object({
  primary_color: z.string().optional().nullable(),
  secondary_color: z.string().optional().nullable(),
  accent_color: z.string().optional().nullable(),
  font_heading: z.string().optional().nullable(),
  font_body: z.string().optional().nullable(),
  brand_voice: z.string().optional().nullable(),
  guidelines: z.object({
    tone: z.string().optional().nullable(),
    do_say: z.array(z.string()).default([]),
    dont_say: z.array(z.string()).default([]),
    value_props: z.array(z.string()).default([]),
    vocabulary: z.array(z.string()).default([]),
    summary: z.string().optional().nullable(),
  }),
});

export type GuidelinesPdfExtraction = z.infer<
  typeof guidelinesPdfExtractionSchema
>;
