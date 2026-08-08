/**
 * AI run metering rules for plan quotas (`ai_runs_month`).
 *
 * Counted toward quota:
 * - User-initiated / content-producing agent runs that are not failed
 *   (queued, running, or complete)
 *
 * Not counted:
 * - Failed runs (bugs, model errors, auth failures)
 * - System / background agents listed in UNMETERED_AGENT_NAMES
 *   (vision tagging, social publish delivery, ESP send, cron digests,
 *   optimisation sweeps, pipeline/finance cron reviews)
 *
 * Inserts should set `agent_runs.metered` via `isMeteredAgentName`.
 * Historical rows are backfilled in migration 00034.
 */

export const UNMETERED_AGENT_NAMES = new Set([
  "media_vision_tag",
  "social_publisher",
  "email_sender",
  "organic_growth",
  "ads_optimisation",
  "ads_optimisation_agent",
  "seo_weekly_summary",
  "pipeline_review",
  "finance_analyst",
  "integration_health",
  "cmo_auto_approve",
  "chief_executive",
  "content_cadence_fill",
]);

export function isMeteredAgentName(agentName: string): boolean {
  return !UNMETERED_AGENT_NAMES.has(agentName);
}
