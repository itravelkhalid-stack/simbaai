import "server-only";

import {
  resolveContentCadence,
  type CadenceSlotKind,
  formatBucket,
} from "@/lib/content/cadence";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";

const MIN_GAP_MS = 2 * 60 * 60 * 1000;

function dayStartUtc(d: Date) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function addDaysUtc(d: Date, days: number) {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

/**
 * Enforce daily caps + 2h spacing at publish time.
 * If this item would exceed cadence for its local UTC day, reschedule to next free slot.
 */
export async function enforcePublishCadenceOrReschedule(params: {
  organizationId: string;
  brandId: string;
  itemId: string;
  platform: ContentPlatform;
  format: ContentFormat;
  scheduledAt: string | null;
}): Promise<
  | { action: "allow" }
  | { action: "rescheduled"; scheduledAt: string; reason: string }
> {
  const supabase = createAdminClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("content_cadence")
    .eq("id", params.brandId)
    .maybeSingle();

  const enabled = await getBrandEnabledContentPlatforms({
    organizationId: params.organizationId,
    brandId: params.brandId,
    admin: true,
  });
  const targets = resolveContentCadence(brand?.content_cadence, enabled);
  const kind: CadenceSlotKind = formatBucket(params.format);
  const target = targets.find(
    (t) => t.platform === params.platform && t.kind === kind,
  );
  const perDay = target?.perDay ?? 0;
  if (perDay <= 0) {
    // No cadence for this slot — still apply 2h spacing using a soft cap of 10
  }
  const dailyCap = perDay > 0 ? perDay : 10;

  const now = new Date();
  let day = dayStartUtc(
    params.scheduledAt ? new Date(params.scheduledAt) : now,
  );
  if (day.getTime() < dayStartUtc(now).getTime()) {
    day = dayStartUtc(now);
  }

  for (let attempt = 0; attempt < 21; attempt++) {
    const dayEnd = addDaysUtc(day, 1);
    const { data: sameFormatDay } = await supabase
      .from("content_items")
      .select("id, scheduled_at, published_at")
      .eq("organization_id", params.organizationId)
      .eq("brand_id", params.brandId)
      .eq("platform", params.platform)
      .eq("format", params.format)
      .neq("id", params.itemId)
      .in("status", ["scheduled", "published", "approved"])
      .or(
        `and(scheduled_at.gte.${day.toISOString()},scheduled_at.lt.${dayEnd.toISOString()}),and(published_at.gte.${day.toISOString()},published_at.lt.${dayEnd.toISOString()})`,
      )
      .order("scheduled_at", { ascending: true });

    const others = sameFormatDay ?? [];
    if (others.length >= dailyCap) {
      day = addDaysUtc(day, 1);
      continue;
    }

    // Find a time with ≥2h gap from others that day
    const times = others
      .map((r) => new Date(r.published_at ?? r.scheduled_at ?? day).getTime())
      .filter((t) => !Number.isNaN(t))
      .sort((a, b) => a - b);

    let candidate = Math.max(now.getTime(), day.getTime() + 8 * 3600_000);
    if (params.scheduledAt) {
      const preferred = new Date(params.scheduledAt).getTime();
      if (preferred >= day.getTime() && preferred < dayEnd.getTime()) {
        candidate = Math.max(preferred, now.getTime());
      }
    }

    const fits = (t: number) =>
      times.every((other) => Math.abs(other - t) >= MIN_GAP_MS);

    if (!fits(candidate)) {
      // try stepping +30m for the rest of the day
      let placed: number | null = null;
      for (let t = candidate; t < dayEnd.getTime() - 30 * 60_000; t += 30 * 60_000) {
        if (fits(t)) {
          placed = t;
          break;
        }
      }
      if (placed == null) {
        day = addDaysUtc(day, 1);
        continue;
      }
      candidate = placed;
    }

    const nextIso = new Date(candidate).toISOString();
    const needsMove =
      !params.scheduledAt ||
      Math.abs(new Date(params.scheduledAt).getTime() - candidate) > 60_000 ||
      candidate > Date.now() + 60_000;

    if (needsMove && candidate > Date.now() + 30_000) {
      await supabase
        .from("content_items")
        .update({
          scheduled_at: nextIso,
          status: "scheduled",
          publish_error: null,
        })
        .eq("id", params.itemId);
      return {
        action: "rescheduled",
        scheduledAt: nextIso,
        reason: `Rescheduled to respect ${params.platform}/${params.format} cadence (max ${dailyCap}/day, ≥2h spacing)`,
      };
    }

    return { action: "allow" };
  }

  // Fallback: push a week out at 10:00 UTC
  const fallback = addDaysUtc(dayStartUtc(now), 7);
  fallback.setUTCHours(10, 0, 0, 0);
  await supabase
    .from("content_items")
    .update({
      scheduled_at: fallback.toISOString(),
      status: "scheduled",
      publish_error: `Rescheduled — no free ${params.platform} slot in the next 3 weeks under cadence`,
    })
    .eq("id", params.itemId);
  return {
    action: "rescheduled",
    scheduledAt: fallback.toISOString(),
    reason: "No free cadence slot; pushed +7 days",
  };
}
