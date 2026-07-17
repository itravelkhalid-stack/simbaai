import { createAdminClient } from "@/lib/supabase/admin";
import { parseMeetingsSettings } from "@/lib/meetings/settings";
import { createAndQueueMeeting } from "@/lib/meetings/run";
import type { MeetingType } from "@/lib/types/meetings";

/** ISO weekday: Monday=1 … Sunday=7 */
function utcWeekday(d: Date) {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

function isFirstDayOfQuarter(d: Date) {
  const m = d.getUTCMonth(); // 0-based
  return d.getUTCDate() === 1 && (m === 0 || m === 3 || m === 6 || m === 9);
}

/**
 * For each brand in every org, schedule meetings that should fire this UTC hour
 * if not already scheduled for the same calendar day + type.
 */
export async function scheduleDueMeetings(now = new Date()) {
  const supabase = createAdminClient();
  const hour = now.getUTCHours();
  const dateKey = now.toISOString().slice(0, 10);
  const weekday = utcWeekday(now);
  const dayOfMonth = now.getUTCDate();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, settings");

  const created: Array<{ meetingId: string; type: MeetingType; brandId: string }> =
    [];

  for (const org of orgs ?? []) {
    const settings = parseMeetingsSettings(
      org.settings as Record<string, unknown>,
    );

    const dueTypes: MeetingType[] = [];
    if (
      settings.daily_standup_enabled &&
      settings.daily_standup_hour_utc === hour
    ) {
      dueTypes.push("daily_standup");
    }
    if (
      settings.weekly_marketing_enabled &&
      settings.weekly_marketing_weekday === weekday &&
      settings.weekly_marketing_hour_utc === hour
    ) {
      dueTypes.push("weekly_marketing");
    }
    if (
      settings.monthly_board_enabled &&
      settings.monthly_board_day === dayOfMonth &&
      settings.monthly_board_hour_utc === hour
    ) {
      dueTypes.push("monthly_board");
    }
    if (
      settings.quarterly_board_enabled &&
      isFirstDayOfQuarter(now) &&
      settings.quarterly_board_hour_utc === hour
    ) {
      dueTypes.push("quarterly_board");
    }

    if (!dueTypes.length) continue;

    const { data: brands } = await supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", org.id);

    for (const brand of brands ?? []) {
      for (const type of dueTypes) {
        const dayStart = `${dateKey}T00:00:00.000Z`;
        const dayEnd = `${dateKey}T23:59:59.999Z`;
        const { data: existing } = await supabase
          .from("meetings")
          .select("id")
          .eq("organization_id", org.id)
          .eq("brand_id", brand.id)
          .eq("type", type)
          .gte("scheduled_for", dayStart)
          .lte("scheduled_for", dayEnd)
          .limit(1);

        if (existing?.length) continue;

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
  }

  return { created, hour, dateKey };
}
