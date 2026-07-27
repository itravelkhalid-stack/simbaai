import "server-only";

import type { AgentRegistryEntry } from "@/lib/agents/registry";
import type { AgentRun } from "@/lib/types/database";

/**
 * Resolve a deep link for an agent run's primary output entity.
 */
export function resolveRunOutputHref(
  entry: AgentRegistryEntry,
  run: AgentRun,
): string | null {
  const input = (run.input ?? {}) as Record<string, unknown>;
  const output = (run.output ?? {}) as Record<string, unknown>;

  if (run.research_project_id) {
    return `/research/${run.research_project_id}`;
  }

  const meetingId = stringId(input.meeting_id ?? output.meeting_id);
  if (meetingId) return `/meetings/${meetingId}`;

  const reportId = stringId(input.report_id ?? output.report_id);
  if (reportId) return `/reviews/${reportId}`;

  const contentItemId = stringId(
    output.content_item_id ?? input.content_item_id ?? output.item_id,
  );
  if (contentItemId) return `/content/${contentItemId}`;

  const planId = stringId(
    output.plan_id ?? input.plan_id ?? output.content_plan_id,
  );
  if (planId && entry.module === "content") {
    return `/content/plans/${planId}`;
  }
  if (planId && entry.module === "planning") {
    return `/planning/plans/${planId}`;
  }
  if (planId && entry.module === "ads") {
    return `/ads/plans/${planId}`;
  }

  const articleId = stringId(output.article_id ?? input.article_id);
  if (articleId) return `/seo/articles/${articleId}`;

  const briefId = stringId(output.brief_id ?? input.brief_id);
  if (briefId) return `/seo/briefs/${briefId}`;

  const campaignId = stringId(output.campaign_id ?? input.campaign_id);
  if (campaignId && entry.module === "ads") {
    return `/ads/campaigns/${campaignId}`;
  }
  if (campaignId && entry.module === "email") {
    return `/email/campaigns/${campaignId}`;
  }

  if (entry.module === "ads" && entry.id.includes("optimisation")) {
    return "/ads/recommendations";
  }

  return entry.moduleHref;
}

function stringId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}
