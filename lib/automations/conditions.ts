import type {
  ConditionGroup,
  ConditionRule,
  MetricThresholdTrigger,
  ScheduleTrigger,
} from "@/lib/types/automations";

function compare(
  left: string | number | boolean | null | undefined,
  op: ConditionRule["op"],
  right: string | number | boolean | undefined,
) {
  if (op === "exists") return left != null && left !== "";
  if (left == null) return false;
  switch (op) {
    case "eq":
      return left === right || String(left) === String(right);
    case "neq":
      return left !== right && String(left) !== String(right);
    case "gt":
      return Number(left) > Number(right);
    case "gte":
      return Number(left) >= Number(right);
    case "lt":
      return Number(left) < Number(right);
    case "lte":
      return Number(left) <= Number(right);
    case "contains":
      return String(left).toLowerCase().includes(String(right ?? "").toLowerCase());
    default:
      return false;
  }
}

export function evaluateConditions(
  groups: ConditionGroup[],
  context: Record<string, unknown>,
): boolean {
  if (!groups.length) return true;
  // All groups must pass (AND between groups)
  return groups.every((group) => {
    const results = group.rules.map((rule) =>
      compare(
        context[rule.field] as string | number | boolean | null | undefined,
        rule.op,
        rule.value,
      ),
    );
    return group.logic === "or"
      ? results.some(Boolean)
      : results.every(Boolean);
  });
}

export function scheduleMatchesNow(
  trigger: ScheduleTrigger,
  now = new Date(),
): boolean {
  const hour = trigger.at_hour ?? 0;
  const minute = trigger.at_minute ?? 0;
  if (now.getUTCHours() !== hour || now.getUTCMinutes() !== minute) {
    // Allow a 5-minute window for cron polling
    const current = now.getUTCHours() * 60 + now.getUTCMinutes();
    const target = hour * 60 + minute;
    if (Math.abs(current - target) > 4) return false;
  }

  if (trigger.frequency === "hourly") return true;
  if (trigger.frequency === "daily") return true;
  if (trigger.frequency === "weekly") {
    const weekday = trigger.weekday ?? 1;
    return now.getUTCDay() === weekday;
  }
  return false;
}

export function metricCompare(
  actual: number,
  op: MetricThresholdTrigger["op"],
  value: number,
) {
  switch (op) {
    case "<":
      return actual < value;
    case "<=":
      return actual <= value;
    case ">":
      return actual > value;
    case ">=":
      return actual >= value;
    default:
      return false;
  }
}

export function buildScheduleContext(now = new Date()) {
  return {
    day_of_month: now.getUTCDate(),
    weekday: now.getUTCDay(),
    hour_utc: now.getUTCHours(),
  };
}
