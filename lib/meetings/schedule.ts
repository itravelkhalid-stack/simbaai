import { createAdminClient } from "@/lib/supabase/admin";
import { parseMeetingsSettings } from "@/lib/meetings/settings";
import { createAndQueueMeeting } from "@/lib/meetings/run";
import {
  getZonedParts,
  isFirstMondayOfJanuary,
  isFirstMondayOfQuarter,
} from "@/lib/meetings/timezone";
import type { MeetingType, MeetingsOrgSettings } from "@/lib/types/meetings";

function dueTypesForMoment(
  settings: MeetingsOrgSettings,
  now: Date,
): { types: MeetingType[]; dateKey: string; hour: number } {
  const z = getZonedParts(now, settings.timezone);
  const types: MeetingType[] = [];

  if (
    settings.daily_standup_enabled &&
    settings.daily_standup_hour === z.hour
  ) {
    types.push("daily_standup");
  }
  if (
    settings.weekly_marketing_enabled &&
    settings.weekly_marketing_weekday === z.weekday &&
    settings.weekly_marketing_hour === z.hour
  ) {
    types.push("weekly_marketing");
  }
  if (
    settings.monthly_board_enabled &&
    settings.monthly_board_day === z.day &&
    settings.monthly_board_hour === z.hour
  ) {
    types.push("monthly_board");
  }
  if (
    settings.quarterly_board_enabled &&
    isFirstMondayOfQuarter(z, settings.timezone) &&
    settings.quarterly_board_hour === z.hour
  ) {
    types.push("quarterly_board");
  }
  if (
    settings.annual_review_enabled &&
    isFirstMondayOfJanuary(z, settings.timezone) &&
    settings.annual_review_hour === z.hour
  ) {
    types.push("annual_review");
  }

  return { types, dateKey: z.dateKey, hour: z.hour };
}

/**
 * Preview the next few scheduled slots for UI (does not create meetings).
 */
export function previewUpcomingMeetings(params: {
  settings: MeetingsOrgSettings;
  brandIds: string[];
  from?: Date;
  hoursAhead?: number;
}) {
  const from = params.from ?? new Date();
  const hoursAhead = params.hoursAhead ?? 24 * 14;
  const slots: Array<{
    type: MeetingType;
    at: string;
    dateKey: string;
    brandId: string;
  }> = [];
  const seen = new Set<string>();

  for (let h = 0; h <= hoursAhead; h += 1) {
    const probe = new Date(from.getTime() + h * 60 * 60 * 1000);
    // Align to the :05 mark like the hourly scheduler
    probe.setUTCMinutes(5, 0, 0);
    const { types, dateKey } = dueTypesForMoment(params.settings, probe);
    for (const type of types) {
      for (const brandId of params.brandIds) {
        const key = `${brandId}:${type}:${dateKey}`;
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push({
          type,
          at: probe.toISOString(),
          dateKey,
          brandId,
        });
      }
    }
  }

  return slots;
}

/**
 * For each brand in every org, schedule meetings that should fire this local hour
 * (org timezone) if not already scheduled for the same local calendar day + type.
 */
export async function scheduleDueMeetings(now = new Date()) {
  const supabase = createAdminClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, settings");

  const created: Array<{ meetingId: string; type: MeetingType; brandId: string }> =
    [];

  for (const org of orgs ?? []) {
    const settings = parseMeetingsSettings(
      org.settings as Record<string, unknown>,
    );
    const { types: dueTypes, dateKey, hour } = dueTypesForMoment(settings, now);
    if (!dueTypes.length) continue;

    const { data: brands } = await supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", org.id);

    for (const brand of brands ?? []) {
      for (const type of dueTypes) {
        // Idempotency window: UTC day covering the local dateKey ± 1 day
        const dayStart = `${dateKey}T00:00:00.000Z`;
        const next = new Date(`${dateKey}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 2);
        const dayEnd = next.toISOString();

        const { data: existing } = await supabase
          .from("meetings")
          .select("id, scheduled_for")
          .eq("organization_id", org.id)
          .eq("brand_id", brand.id)
          .eq("type", type)
          .gte("scheduled_for", dayStart)
          .lt("scheduled_for", dayEnd)
          .limit(5);

        const already = (existing ?? []).some((row) => {
          const z = getZonedParts(new Date(row.scheduled_for), settings.timezone);
          return z.dateKey === dateKey;
        });
        if (already) continue;

        const meeting = await createAndQueueMeeting({
          organizationId: org.id,
          brandId: brand.id,
          type,
          scheduledFor: now.toISOString(),
          title: undefined,
        });
        created.push({
          meetingId: meeting.id,
          type,
          brandId: brand.id,
        });
      }
    }

    void hour;
  }

  const sample = getZonedParts(now, "Europe/London");
  return {
    created,
    hour: sample.hour,
    dateKey: sample.dateKey,
    timezoneSample: "Europe/London",
  };
}
