import { z } from "zod";

export const mediaUploadMetaSchema = z.object({
  brandId: z.string().uuid(),
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

export const detachContentMediaSchema = z.object({
  itemId: z.string().uuid(),
  assetId: z.string().uuid(),
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
