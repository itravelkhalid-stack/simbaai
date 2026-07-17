import type { EmailSubscriber, SegmentRuleGroup } from "@/lib/types/email";

function getFieldValue(
  subscriber: EmailSubscriber & { tags?: string[] },
  field: string,
) {
  if (field === "email") return subscriber.email;
  if (field === "first_name") return subscriber.first_name ?? "";
  if (field === "last_name") return subscriber.last_name ?? "";
  if (field === "status") return subscriber.status;
  if (field === "source") return subscriber.source ?? "";
  if (field === "tag") return (subscriber.tags ?? []).join(",");
  if (field.startsWith("custom.")) {
    return String(subscriber.custom_fields?.[field.slice(7)] ?? "");
  }
  return "";
}

function matchRule(
  subscriber: EmailSubscriber & { tags?: string[] },
  rule: SegmentRuleGroup["rules"][number],
) {
  const raw = getFieldValue(subscriber, rule.field);
  const value = rule.value;

  switch (rule.operator) {
    case "eq":
      return raw.toLowerCase() === value.toLowerCase();
    case "neq":
      return raw.toLowerCase() !== value.toLowerCase();
    case "contains":
      return raw.toLowerCase().includes(value.toLowerCase());
    case "gt":
      return Number(raw) > Number(value);
    case "lt":
      return Number(raw) < Number(value);
    case "in":
      return value
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .includes(raw.toLowerCase());
    case "not_in":
      return !value
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .includes(raw.toLowerCase());
    case "is_set":
      return Boolean(raw);
    case "is_empty":
      return !raw;
    default:
      return false;
  }
}

export function subscriberMatchesSegment(
  subscriber: EmailSubscriber & { tags?: string[] },
  rules: SegmentRuleGroup,
) {
  if (!rules.rules?.length) return true;
  if (rules.combinator === "or") {
    return rules.rules.some((rule) => matchRule(subscriber, rule));
  }
  return rules.rules.every((rule) => matchRule(subscriber, rule));
}
