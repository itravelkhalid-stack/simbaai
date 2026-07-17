# Automations

Module path: `/automations`

Event-driven and scheduled workflows: trigger → optional conditions → ordered actions, with approval and budget safety rails.

## Tables

- `automations` — name, status, trigger/conditions/actions JSON, webhook_secret, run stats
- `automation_runs` — status, trigger_data, actions_executed, error
- `brand_automation_settings` — auto_publish_channels, daily_budget_action_cap_pence, slack_webhook_url
- `automation_budget_usage` — per-brand daily usage for budget-affecting actions

Migration: `00016_automations_module.sql`

## Triggers

| Type | Shape | Evaluator |
|------|--------|-----------|
| `schedule` | `{ frequency, at_hour, at_minute, weekday? }` | Inngest every 5 min |
| `metric_threshold` | `{ metric, op, value, days }` | Daily 07:10 UTC |
| `event` | `{ event, tag? }` | `emitAutomationEvent` hooks |
| `webhook` | `{}` + `webhook_secret` | `POST /api/automations/webhook/[id]` |

Events: `subscriber.created`, `deal.won`, `post.published`, `report.ready`, `contact.tagged`.

Metrics: `roas`, `spend_pence`, `ctr`, `sessions`, `scheduled_posts`.

## Actions

- `run_agent` — content_batch / email_draft / research_refresh
- `notify` — in_app / email / Slack webhook
- `create_task` — planning `campaign_tasks`
- `pause_ad_campaign` / `resume_ad_campaign` (resume gated by auto-publish + daily cap)
- `add_contact_tag`
- `send_email_campaign` (segment optional; gated by email auto-publish)
- `outbound_webhook`

## Safety rails

- External publish/send/resume without channel in `auto_publish_channels` → routed to approvals / blocked with `routed_to_approval`
- Resume/spend actions count toward `daily_budget_action_cap_pence` (default £500)

Configure at `/automations/settings`.

## UI

- `/automations` — list
- `/automations/recipes` — one-click templates
- `/automations/[id]` — vertical flow view, JSON editor, test-run, run history
- Webhook URL shown when trigger type is `webhook`

## Recipes

- Weekly content top-up (scheduled posts &lt; 5)
- ROAS drop → alert + pause
- Welcome when contact tagged `lead`
- Monthly research refresh (1st of month)
