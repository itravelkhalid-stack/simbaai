import "server-only";

import { assignScheduleSlotUnderCadence } from "@/lib/content/schedule-slots";
import type { ContentFormat, ContentPlatform } from "@/lib/types/content";

/**
 * Enforce daily caps + 2h spacing at publish time.
 * If this item would exceed cadence for its UTC day, reschedule to next free slot.
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
  const placed = await assignScheduleSlotUnderCadence({
    organizationId: params.organizationId,
    brandId: params.brandId,
    itemId: params.itemId,
    platform: params.platform,
    format: params.format,
    preferredAt: params.scheduledAt,
    forceWrite: true,
  });

  if (!placed.ok) {
    // Last resort: push +7 days at 10:00 UTC (mirrors prior publish-cadence fallback)
    const fallback = new Date();
    fallback.setUTCDate(fallback.getUTCDate() + 7);
    fallback.setUTCHours(10, 0, 0, 0);
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    await supabase
      .from("content_items")
      .update({
        scheduled_at: fallback.toISOString(),
        status: "scheduled",
        publish_error: `Rescheduled — ${placed.reason}`,
      })
      .eq("id", params.itemId);
    return {
      action: "rescheduled",
      scheduledAt: fallback.toISOString(),
      reason: placed.reason,
    };
  }

  if (placed.moved) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    await supabase
      .from("content_items")
      .update({
        scheduled_at: placed.scheduledAt,
        status: "scheduled",
        publish_error: null,
      })
      .eq("id", params.itemId);
    return {
      action: "rescheduled",
      scheduledAt: placed.scheduledAt,
      reason: placed.reason,
    };
  }

  return { action: "allow" };
}
