import "server-only";

import {
  addUtcDays,
  formatBucket,
  isoDateUtc,
  resolveContentCadence,
  slotHourUtc,
  type CadenceSlotKind,
} from "@/lib/content/cadence";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentItemStatus, ContentPlatform } from "@/lib/types/content";

/** Items that count toward cadence "coverage" (fill / CEO). */
export const CADENCE_COVERAGE_STATUSES: readonly ContentItemStatus[] = [
  "scheduled",
  "approved",
  "published",
];

/**
 * Items that occupy a calendar slot when placing/rescheduling.
 * Includes pending_approval so we don't stack on days already full of backlog.
 */
export const CADENCE_OCCUPYING_STATUSES: readonly ContentItemStatus[] = [
  "scheduled",
  "approved",
  "published",
  "pending_approval",
];

const MIN_GAP_MS = 2 * 60 * 60 * 1000;
const DEFAULT_HORIZON_DAYS = 21;

export function cadenceCountKey(
  date: string,
  platform: ContentPlatform,
  kind: CadenceSlotKind,
) {
  return `${date}|${platform}|${kind}`;
}

export function dayStartUtc(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function feedFormatsForKind(kind: CadenceSlotKind): ContentFormat[] {
  return kind === "story"
    ? ["story"]
    : ["post", "carousel", "reel_script", "thread", "short_script"];
}

type OccupyingRow = {
  id: string;
  scheduled_at: string | null;
  published_at: string | null;
  format: string;
  status: string;
};

/**
 * Count occupying items per `${date}|${platform}|${kind}` in [from, from+horizonDays).
 */
export async function loadCadenceOccupancyCounts(params: {
  organizationId: string;
  brandId: string;
  fromDate?: Date;
  horizonDays?: number;
  /** Defaults to coverage statuses (scheduled/approved/published). */
  statuses?: readonly ContentItemStatus[];
  excludeItemId?: string;
}): Promise<Map<string, number>> {
  const supabase = createAdminClient();
  const from = dayStartUtc(params.fromDate ?? new Date());
  const horizon = params.horizonDays ?? 7;
  const end = addUtcDays(from, horizon);
  const statuses = [...(params.statuses ?? CADENCE_COVERAGE_STATUSES)];

  let query = supabase
    .from("content_items")
    .select("id, platform, format, scheduled_at, status")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .in("status", statuses)
    .gte("scheduled_at", from.toISOString())
    .lt("scheduled_at", end.toISOString())
    .limit(3000);

  if (params.excludeItemId) {
    query = query.neq("id", params.excludeItemId);
  }

  const { data } = await query;
  const counts = new Map<string, number>();
  for (const item of data ?? []) {
    if (!item.scheduled_at) continue;
    const date = item.scheduled_at.slice(0, 10);
    const kind = formatBucket(item.format as ContentFormat);
    const key = cadenceCountKey(
      date,
      item.platform as ContentPlatform,
      kind,
    );
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function loadDayOccupants(params: {
  organizationId: string;
  brandId: string;
  platform: ContentPlatform;
  kind: CadenceSlotKind;
  day: Date;
  excludeItemId?: string;
}): Promise<OccupyingRow[]> {
  const supabase = createAdminClient();
  const dayEnd = addUtcDays(params.day, 1);
  const formats = feedFormatsForKind(params.kind);

  let scheduledQuery = supabase
    .from("content_items")
    .select("id, scheduled_at, published_at, format, status")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("platform", params.platform)
    .in("format", formats)
    .in("status", [...CADENCE_OCCUPYING_STATUSES])
    .gte("scheduled_at", params.day.toISOString())
    .lt("scheduled_at", dayEnd.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (params.excludeItemId) {
    scheduledQuery = scheduledQuery.neq("id", params.excludeItemId);
  }

  let publishedQuery = supabase
    .from("content_items")
    .select("id, scheduled_at, published_at, format, status")
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .eq("platform", params.platform)
    .in("format", formats)
    .eq("status", "published" as ContentItemStatus)
    .gte("published_at", params.day.toISOString())
    .lt("published_at", dayEnd.toISOString())
    .limit(200);

  if (params.excludeItemId) {
    publishedQuery = publishedQuery.neq("id", params.excludeItemId);
  }

  const [{ data: scheduled }, { data: published }] = await Promise.all([
    scheduledQuery,
    publishedQuery,
  ]);

  const byId = new Map<string, OccupyingRow>();
  for (const row of [...(scheduled ?? []), ...(published ?? [])]) {
    byId.set(row.id, row as OccupyingRow);
  }
  return [...byId.values()].sort((a, b) => {
    const ta = new Date(a.published_at ?? a.scheduled_at ?? 0).getTime();
    const tb = new Date(b.published_at ?? b.scheduled_at ?? 0).getTime();
    return ta - tb;
  });
}

function pickTimeWithSpacing(params: {
  day: Date;
  kind: CadenceSlotKind;
  index: number;
  preferredAt: Date | null;
  now: Date;
  occupiedTimes: number[];
}): number | null {
  const dayEnd = addUtcDays(params.day, 1).getTime();
  const hour = slotHourUtc(params.kind, params.index);
  let candidate = new Date(params.day);
  candidate.setUTCHours(hour, 0, 0, 0);

  if (params.preferredAt) {
    const pref = params.preferredAt.getTime();
    if (pref >= params.day.getTime() && pref < dayEnd) {
      candidate = new Date(Math.max(pref, params.now.getTime()));
    }
  }

  if (candidate.getTime() < params.now.getTime()) {
    candidate = new Date(
      Math.max(params.now.getTime(), params.day.getTime() + 8 * 3600_000),
    );
  }

  const fits = (t: number) =>
    params.occupiedTimes.every((other) => Math.abs(other - t) >= MIN_GAP_MS);

  if (fits(candidate.getTime()) && candidate.getTime() < dayEnd - 30 * 60_000) {
    return candidate.getTime();
  }

  const startScan = Math.max(
    candidate.getTime(),
    params.day.getTime() + 8 * 3600_000,
    params.now.getTime(),
  );
  for (let t = startScan; t < dayEnd - 30 * 60_000; t += 30 * 60_000) {
    if (fits(t)) return t;
  }
  return null;
}

/**
 * Find the next day/time with free capacity for this platform/format under cadence.
 * Never places beyond the daily cap; walks forward up to `maxDaysAhead`.
 */
export async function findNextFreeScheduleSlot(params: {
  organizationId: string;
  brandId: string;
  platform: ContentPlatform;
  format: ContentFormat;
  preferredAt?: string | null;
  excludeItemId?: string;
  maxDaysAhead?: number;
}): Promise<{ scheduledAt: string; moved: boolean; reason: string } | null> {
  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("content_cadence")
    .eq("id", params.brandId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  const enabled = await getBrandEnabledContentPlatforms({
    organizationId: params.organizationId,
    brandId: params.brandId,
    admin: true,
  });
  const targets = resolveContentCadence(brand?.content_cadence, enabled);
  const kind = formatBucket(params.format);
  const target = targets.find(
    (t) => t.platform === params.platform && t.kind === kind,
  );
  const dailyCap = target && target.perDay > 0 ? target.perDay : 1;

  const now = new Date();
  const preferred = params.preferredAt ? new Date(params.preferredAt) : null;
  let day = dayStartUtc(
    preferred && !Number.isNaN(preferred.getTime()) ? preferred : now,
  );
  if (day.getTime() < dayStartUtc(now).getTime()) {
    day = dayStartUtc(now);
  }

  const maxDays = params.maxDaysAhead ?? DEFAULT_HORIZON_DAYS;
  const preferredIso = preferred?.toISOString() ?? null;

  for (let attempt = 0; attempt < maxDays; attempt++) {
    const others = await loadDayOccupants({
      organizationId: params.organizationId,
      brandId: params.brandId,
      platform: params.platform,
      kind,
      day,
      excludeItemId: params.excludeItemId,
    });

    if (others.length >= dailyCap) {
      day = addUtcDays(day, 1);
      continue;
    }

    const times = others
      .map((r) => new Date(r.published_at ?? r.scheduled_at ?? day).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);

    const placed = pickTimeWithSpacing({
      day,
      kind,
      index: others.length,
      preferredAt: preferred,
      now,
      occupiedTimes: times,
    });

    if (placed == null) {
      day = addUtcDays(day, 1);
      continue;
    }

    const scheduledAt = new Date(placed).toISOString();
    const moved =
      !preferredIso ||
      Math.abs(new Date(preferredIso).getTime() - placed) > 60_000;

    return {
      scheduledAt,
      moved,
      reason: moved
        ? `Placed on ${isoDateUtc(day)} to respect ${params.platform}/${kind} cadence (max ${dailyCap}/day, ≥2h spacing)`
        : "Preferred slot has capacity",
    };
  }

  return null;
}

/**
 * Assign scheduled_at for an item under cadence caps. Updates the row when moved
 * or when the item had no schedule. Returns the final slot.
 */
export async function assignScheduleSlotUnderCadence(params: {
  organizationId: string;
  brandId: string;
  itemId: string;
  platform: ContentPlatform;
  format: ContentFormat;
  preferredAt?: string | null;
  /** When true, always write scheduled_at even if preferred fits. */
  forceWrite?: boolean;
  maxDaysAhead?: number;
}): Promise<
  | { ok: true; scheduledAt: string; moved: boolean; reason: string }
  | { ok: false; reason: string }
> {
  const slot = await findNextFreeScheduleSlot({
    organizationId: params.organizationId,
    brandId: params.brandId,
    platform: params.platform,
    format: params.format,
    preferredAt: params.preferredAt,
    excludeItemId: params.itemId,
    maxDaysAhead: params.maxDaysAhead,
  });

  if (!slot) {
    return {
      ok: false,
      reason: `No free ${params.platform}/${formatBucket(params.format)} slot in the next ${DEFAULT_HORIZON_DAYS} days under cadence`,
    };
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("content_items")
    .select("scheduled_at")
    .eq("id", params.itemId)
    .eq("organization_id", params.organizationId)
    .maybeSingle();

  const currentAt = current?.scheduled_at ?? null;
  const mustWrite =
    params.forceWrite ||
    !params.preferredAt ||
    slot.moved ||
    !currentAt ||
    Math.abs(new Date(currentAt).getTime() - new Date(slot.scheduledAt).getTime()) >
      60_000;

  if (mustWrite) {
    const { error } = await supabase
      .from("content_items")
      .update({ scheduled_at: slot.scheduledAt })
      .eq("id", params.itemId)
      .eq("organization_id", params.organizationId);
    if (error) {
      return { ok: false, reason: error.message };
    }
  }

  return {
    ok: true,
    scheduledAt: slot.scheduledAt,
    moved: slot.moved,
    reason: slot.reason,
  };
}
