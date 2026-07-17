import { z } from "zod";

export const startResearchSchema = z.object({
  type: z.enum([
    "brand_audit",
    "competitor",
    "market",
    "keyword",
    "audience",
    "trend",
  ]),
  title: z.string().trim().min(3).max(160),
  notes: z.string().trim().min(10).max(5000),
  brandId: z.string().uuid().optional(),
  competitorUrls: z
    .string()
    .optional()
    .transform((value) =>
      (value ?? "")
        .split(/[\n,]+/)
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  discoverTop5: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => value === true || value === "on" || value === "true"),
  model: z.string().trim().optional(),
});

export const refreshResearchSchema = z.object({
  projectId: z.string().uuid(),
  notes: z.string().trim().max(5000).optional(),
});

export const pushInsightsSchema = z.object({
  projectId: z.string().uuid(),
});
