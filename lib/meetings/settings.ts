import {
  DEFAULT_MEETINGS_SETTINGS,
  type MeetingsOrgSettings,
} from "@/lib/types/meetings";

/**
 * Parse org meeting settings. Legacy `*_hour_utc` keys map to local-hour fields
 * for backwards compatibility; hours are now interpreted in `timezone`.
 */
export function parseMeetingsSettings(
  raw: Record<string, unknown> | null | undefined,
): MeetingsOrgSettings {
  const m = (raw?.meetings ?? {}) as Record<string, unknown>;
  return {
    timezone:
      typeof m.timezone === "string" && m.timezone.trim()
        ? m.timezone.trim()
        : DEFAULT_MEETINGS_SETTINGS.timezone,
    daily_standup_enabled:
      (m.daily_standup_enabled as boolean | undefined) ??
      DEFAULT_MEETINGS_SETTINGS.daily_standup_enabled,
    daily_standup_hour: clampHour(
      (m.daily_standup_hour as number | undefined) ??
        (m.daily_standup_hour_utc as number | undefined) ??
        DEFAULT_MEETINGS_SETTINGS.daily_standup_hour,
    ),
    weekly_marketing_enabled:
      (m.weekly_marketing_enabled as boolean | undefined) ??
      DEFAULT_MEETINGS_SETTINGS.weekly_marketing_enabled,
    weekly_marketing_weekday: clampWeekday(
      (m.weekly_marketing_weekday as number | undefined) ??
        DEFAULT_MEETINGS_SETTINGS.weekly_marketing_weekday,
    ),
    weekly_marketing_hour: clampHour(
      (m.weekly_marketing_hour as number | undefined) ??
        (m.weekly_marketing_hour_utc as number | undefined) ??
        DEFAULT_MEETINGS_SETTINGS.weekly_marketing_hour,
    ),
    monthly_board_enabled:
      (m.monthly_board_enabled as boolean | undefined) ??
      DEFAULT_MEETINGS_SETTINGS.monthly_board_enabled,
    monthly_board_day: clampDay(
      (m.monthly_board_day as number | undefined) ??
        DEFAULT_MEETINGS_SETTINGS.monthly_board_day,
    ),
    monthly_board_hour: clampHour(
      (m.monthly_board_hour as number | undefined) ??
        (m.monthly_board_hour_utc as number | undefined) ??
        DEFAULT_MEETINGS_SETTINGS.monthly_board_hour,
    ),
    quarterly_board_enabled:
      (m.quarterly_board_enabled as boolean | undefined) ??
      DEFAULT_MEETINGS_SETTINGS.quarterly_board_enabled,
    quarterly_board_hour: clampHour(
      (m.quarterly_board_hour as number | undefined) ??
        (m.quarterly_board_hour_utc as number | undefined) ??
        DEFAULT_MEETINGS_SETTINGS.quarterly_board_hour,
    ),
    annual_review_enabled:
      (m.annual_review_enabled as boolean | undefined) ??
      DEFAULT_MEETINGS_SETTINGS.annual_review_enabled,
    annual_review_hour: clampHour(
      (m.annual_review_hour as number | undefined) ??
        DEFAULT_MEETINGS_SETTINGS.annual_review_hour,
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
