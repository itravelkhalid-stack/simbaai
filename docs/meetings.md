# AI Meetings

Module path: `/meetings`

The agency “holds meetings” about each brand’s marketing and stores them as readable records with decisions and actions.

## Meeting types

| Type | Agent | Output |
|------|--------|--------|
| `daily_standup` | Morning cross-module digest | Yesterday / Today / Blockers |
| `weekly_marketing` | Persona panel | Discussion + next-week priorities + decisions/actions |
| `monthly_board` / `quarterly_board` | Board pack | Exec summary, P&L, KPIs, wins/misses/risks, budget proposal |
| `adhoc` | Weekly-style panel | On-demand |

## Scheduling

Org settings live under `organizations.settings.meetings` (UI: `/meetings/settings`).

Hourly Inngest job `meetings/hourly-scheduler` creates due meetings per brand (idempotent per day+type), then emits `meetings/run`.

## Jobs

| Function | Trigger |
|----------|---------|
| `meetings/hourly-scheduler` | cron `5 * * * *` |
| `meetings/run` | event `meetings/run` |

## Product features

- Meetings feed at `/meetings`
- Comments on any meeting
- Convert action → `campaign_tasks` (picks/creates a campaign for the brand)
- Blockers with `needs_human` create `notifications` for org members
- “Ask about this meeting” chat grounded in minutes + context snapshot

## Tables

- `meetings` — agenda, minutes_markdown, decisions, actions, blockers, context_snapshot
- `meeting_actions` — owned actions with optional `linked_task_id`
- `meeting_comments`
- `meeting_chat_messages`

See migration `00010_meetings_module.sql`.
