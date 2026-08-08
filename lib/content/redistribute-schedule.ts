import "server-only";

import {
  formatBucket,
  resolveContentCadence,
  type CadenceSlotKind,
} from "@/lib/content/cadence";
import { assignScheduleSlotUnderCadence } from "@/lib/content/schedule-slots";
import { isNearDuplicateTopic } from "@/lib/content/topic-similarity";
import { getBrandEnabledContentPlatforms } from "@/lib/brand/channels";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";

export type RedistributeResult = {
  brandId: string;
  cadenceSaved: boolean;
  moved: Array<{ id: string; from: string; to: string; platform: string; kind: string }>;
  parkedDuplicates: Array<{ id: string; similarTo: string; title: string }>;
  errors: string[];
};

const ONE_ONE_ONE_ONE = {
  instagram: { feed_per_day: 1, stories_per_day: 1 },
  facebook: { feed_per_day: 1 },
  linkedin: { feed_per_day: 1 },
};

/**
 * Persist 1/1/1/1 cadence (optional) and move overflowing scheduled/pending items
 * to the next day with free capacity. Parks clear near-duplicates among the queue.
 */
export async function redistributeBrandScheduleToCadence(params: {
  organizationId: string;
  brandId: string;
  /** Inclusive UTC date YYYY-MM-DD to start scanning from. */
  fromDate: string;
  /** How many days ahead to consider when placing overflow. */
  horizonDays?: number;
  /** Persist the 1/1/1/1 cadence config on the brand. */
  saveCadence1111?: boolean;
  parkNearDuplicates?: boolean;
}): Promise<RedistributeResult> {
  const supabase = createAdminClient();
  const result: RedistributeResult = {
    brandId: params.brandId,
    cadenceSaved: false,
    moved: [],
    parkedDuplicates: [],
    errors: [],
  };

  if (params.saveCadence1111 !== false) {
    const { error } = await supabase
      .from("brands")
      .update({ content_cadence: ONE_ONE_ONE_ONE })
      .eq("id", params.brandId)
      .eq("organization_id", params.organizationId);
    if (error) {
      result.errors.push(`cadence save: ${error.message}`);
    } else {
      result.cadenceSaved = true;
    }
  }

  const { data: brand } = await supabase
    .from("brands")
    .select("content_cadence")
    .eq("id", params.brandId)
    .single();

  const enabled = await getBrandEnabledContentPlatforms({
    organizationId: params.organizationId,
    brandId: params.brandId,
    admin: true,
  });
  const targets = resolveContentCadence(brand?.content_cadence, enabled);
  const capByKey = new Map<string, number>();
  for (const t of targets) {
    capByKey.set(`${t.platform}|${t.kind}`, t.perDay);
  }

  const start = new Date(`${params.fromDate}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + (params.horizonDays ?? 21));

  const { data: items, error: itemsErr } = await supabase
    .from("content_items")
    .select(
      "id, title, copy, platform, format, status, scheduled_at, cmo_note",
    )
    .eq("organization_id", params.organizationId)
    .eq("brand_id", params.brandId)
    .in("status", ["scheduled", "approved", "pending_approval"])
    .gte("scheduled_at", start.toISOString())
    .lt("scheduled_at", end.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(3000);

  if (itemsErr) {
    result.errors.push(itemsErr.message);
    return result;
  }

  const keptTitles: string[] = [];
  const toRelocate: typeof items = [];

  // Per day+platform+kind: keep up to cap; overflow relocates.
  const dayCounts = new Map<string, number>();

  for (const item of items ?? []) {
    if (!item.scheduled_at) continue;
    const title = String(item.title || item.copy || "").slice(0, 200);

    if (params.parkNearDuplicates !== false && title.length >= 8) {
      const similar = keptTitles.find((t) => isNearDuplicateTopic(title, t));
      if (similar) {
        const note = `Near-duplicate of “${similar.slice(0, 80)}” — parked during cadence redistribute.`;
        const { error } = await supabase
          .from("content_items")
          .update({
            status: "pending_approval",
            cmo_note: note,
            // Clear slot so it no longer inflates the calendar
            scheduled_at: null,
          })
          .eq("id", item.id)
          .eq("organization_id", params.organizationId);
        if (error) {
          result.errors.push(`${item.id}: park dup ${error.message}`);
        } else {
          result.parkedDuplicates.push({
            id: item.id,
            similarTo: similar.slice(0, 80),
            title: title.slice(0, 80),
          });
        }
        continue;
      }
    }

    const kind = formatBucket(item.format as ContentFormat);
    const date = item.scheduled_at.slice(0, 10);
    const slotKey = `${date}|${item.platform}|${kind}`;
    const cap = capByKey.get(`${item.platform}|${kind}`) ?? 1;
    const have = dayCounts.get(slotKey) ?? 0;
    if (have < cap) {
      dayCounts.set(slotKey, have + 1);
      if (title) keptTitles.push(title);
      continue;
    }
    toRelocate.push(item);
  }

  // Relocate overflow earliest-first so they claim the soonest free days.
  for (const item of toRelocate) {
    const kind = formatBucket(item.format as ContentFormat) as CadenceSlotKind;
    const from = item.scheduled_at!;
    // Start search from next day so we don't re-compete on the overloaded day
    const nextDay = new Date(from);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    nextDay.setUTCHours(9, 0, 0, 0);

    const placed = await assignScheduleSlotUnderCadence({
      organizationId: params.organizationId,
      brandId: params.brandId,
      itemId: item.id,
      platform: item.platform as ContentPlatform,
      format: item.format as ContentFormat,
      preferredAt: nextDay.toISOString(),
      forceWrite: true,
    });

    if (!placed.ok) {
      result.errors.push(`${item.id}: ${placed.reason}`);
      continue;
    }

    // Keep status; if it was scheduled/approved stay so. pending stays pending.
    result.moved.push({
      id: item.id,
      from,
      to: placed.scheduledAt,
      platform: item.platform,
      kind,
    });
  }

  return result;
}
