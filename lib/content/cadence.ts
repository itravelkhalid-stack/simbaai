import { z } from "zod";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";

const platformQuotaSchema = z.object({
  feed_per_day: z.number().int().min(0).max(10).optional(),
  stories_per_day: z.number().int().min(0).max(10).optional(),
});

export const contentCadenceSchema = z.object({
  instagram: platformQuotaSchema.optional(),
  facebook: platformQuotaSchema.optional(),
  linkedin: platformQuotaSchema.optional(),
});

export type ContentCadenceConfig = z.infer<typeof contentCadenceSchema>;

export type CadenceSlotKind = "feed" | "story";

export type CadenceTarget = {
  platform: ContentPlatform;
  kind: CadenceSlotKind;
  format: ContentFormat;
  perDay: number;
};

/** Product defaults when brand cadence is empty / partial. */
export const DEFAULT_CONTENT_CADENCE: Required<ContentCadenceConfig> = {
  instagram: { feed_per_day: 2, stories_per_day: 2 },
  facebook: { feed_per_day: 1, stories_per_day: 0 },
  linkedin: { feed_per_day: 1, stories_per_day: 0 },
};

export function parseContentCadence(raw: unknown): ContentCadenceConfig {
  const parsed = contentCadenceSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

export function resolveContentCadence(
  raw: unknown,
  enabledPlatforms: ContentPlatform[],
): CadenceTarget[] {
  const config = parseContentCadence(raw);
  const enabled = new Set(enabledPlatforms);
  const targets: CadenceTarget[] = [];

  if (enabled.has("instagram")) {
    const ig = {
      ...DEFAULT_CONTENT_CADENCE.instagram,
      ...config.instagram,
    };
    if ((ig.feed_per_day ?? 0) > 0) {
      targets.push({
        platform: "instagram",
        kind: "feed",
        format: "post",
        perDay: ig.feed_per_day!,
      });
    }
    if ((ig.stories_per_day ?? 0) > 0) {
      targets.push({
        platform: "instagram",
        kind: "story",
        format: "story",
        perDay: ig.stories_per_day!,
      });
    }
  }

  if (enabled.has("facebook")) {
    const fb = {
      ...DEFAULT_CONTENT_CADENCE.facebook,
      ...config.facebook,
    };
    if ((fb.feed_per_day ?? 0) > 0) {
      targets.push({
        platform: "facebook",
        kind: "feed",
        format: "post",
        perDay: fb.feed_per_day!,
      });
    }
  }

  if (enabled.has("linkedin")) {
    const li = {
      ...DEFAULT_CONTENT_CADENCE.linkedin,
      ...config.linkedin,
    };
    if ((li.feed_per_day ?? 0) > 0) {
      targets.push({
        platform: "linkedin",
        kind: "feed",
        format: "post",
        perDay: li.feed_per_day!,
      });
    }
  }

  return targets;
}

export function formatBucket(format: ContentFormat): CadenceSlotKind {
  return format === "story" ? "story" : "feed";
}

/** Stable hour offsets within the day for multiple slots of the same kind. */
export function slotHourUtc(kind: CadenceSlotKind, index: number): number {
  if (kind === "story") {
    const hours = [11, 15, 19, 21];
    return hours[index % hours.length]!;
  }
  const hours = [9, 13, 17, 20];
  return hours[index % hours.length]!;
}

export function isoDateUtc(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function addUtcDays(from: Date, days: number) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Compute missing slots for the next `horizonDays` (inclusive of today).
 * Counts any non-rejected item with scheduled_at in the day toward its bucket.
 */
export function computeCadenceGaps(params: {
  targets: CadenceTarget[];
  /** Keys: `${date}|${platform}|${kind}` → count */
  existingCounts: Map<string, number>;
  horizonDays: number;
  fromDate?: Date;
}): Array<{
  date: string;
  platform: ContentPlatform;
  kind: CadenceSlotKind;
  format: ContentFormat;
  index: number;
  scheduledAt: string;
}> {
  const from = params.fromDate ?? new Date();
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const gaps: Array<{
    date: string;
    platform: ContentPlatform;
    kind: CadenceSlotKind;
    format: ContentFormat;
    index: number;
    scheduledAt: string;
  }> = [];

  for (let day = 0; day < params.horizonDays; day++) {
    const date = isoDateUtc(addUtcDays(start, day));
    for (const target of params.targets) {
      const key = `${date}|${target.platform}|${target.kind}`;
      const have = params.existingCounts.get(key) ?? 0;
      for (let i = have; i < target.perDay; i++) {
        const hour = slotHourUtc(target.kind, i);
        const scheduledAt = new Date(`${date}T00:00:00.000Z`);
        scheduledAt.setUTCHours(hour, 0, 0, 0);
        gaps.push({
          date,
          platform: target.platform,
          kind: target.kind,
          format: target.format,
          index: i,
          scheduledAt: scheduledAt.toISOString(),
        });
      }
    }
  }

  return gaps;
}
