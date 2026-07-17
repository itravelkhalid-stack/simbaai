import {
  DEFAULT_MEETINGS_SETTINGS,
  type MeetingsOrgSettings,
} from "@/lib/types/meetings";

export function parseMeetingsSettings(
  raw: Record<string, unknown> | null | undefined,
): MeetingsOrgSettings {
  const m = (raw?.meetings ?? {}) as Partial<MeetingsOrgSettings>;
  return {
    daily_standup_enabled:
      m.daily_standup_enabled ?? DEFAULT_MEETINGS_SETTINGS.daily_standup_enabled,
    daily_standup_hour_utc: clampHour(
      m.daily_standup_hour_utc ?? DEFAULT_MEETINGS_SETTINGS.daily_standup_hour_utc,
    ),
    weekly_marketing_enabled:
      m.weekly_marketing_enabled ??
      DEFAULT_MEETINGS_SETTINGS.weekly_marketing_enabled,
    weekly_marketing_weekday: clampWeekday(
      m.weekly_marketing_weekday ??
        DEFAULT_MEETINGS_SETTINGS.weekly_marketing_weekday,
    ),
    weekly_marketing_hour_utc: clampHour(
      m.weekly_marketing_hour_utc ??
        DEFAULT_MEETINGS_SETTINGS.weekly_marketing_hour_utc,
    ),
    monthly_board_enabled:
      m.monthly_board_enabled ?? DEFAULT_MEETINGS_SETTINGS.monthly_board_enabled,
    monthly_board_day: clampDay(
      m.monthly_board_day ?? DEFAULT_MEETINGS_SETTINGS.monthly_board_day,
    ),
    monthly_board_hour_utc: clampHour(
      m.monthly_board_hour_utc ?? DEFAULT_MEETINGS_SETTINGS.monthly_board_hour_utc,
    ),
    quarterly_board_enabled:
      m.quarterly_board_enabled ??
      DEFAULT_MEETINGS_SETTINGS.quarterly_board_enabled,
    quarterly_board_hour_utc: clampHour(
      m.quarterly_board_hour_utc ??
        DEFAULT_MEETINGS_SETTINGS.quarterly_board_hour_utc,
    ),
  };
}

function clampHour(n: number) {
  return Math.min(23, Math.max(0, Math.round(Number(n) || 0)));
}

function clampWeekday(n: number) {
  return Math.min(7, Math.max(1, Math.round(Number(n) || 1)));
}

function clampDay(n: number) {
  return Math.min(28, Math.max(1, Math.round(Number(n) || 1)));
}
