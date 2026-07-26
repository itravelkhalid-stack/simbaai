# AI Meetings

Module path: `/meetings`

The agency “holds meetings” about each brand’s marketing and stores them as readable records with decisions, typed actions, and escalation.

## Meeting types

| Type | Agent | Output |
|------|--------|--------|
| `daily_standup` | Morning cross-module digest | Yesterday / Today / Blockers |
| `weekly_marketing` | Persona panel | Discussion + priorities + typed actions |
| `monthly_board` / `quarterly_board` | Board pack | Exec summary, P&L, KPIs, recommendations |
| `annual_review` | Full-year retrospective | Plan vs actual, KPI attainment, next-year strategy |
| `adhoc` | Weekly-style panel | On-demand |

## Scheduling

Org settings live under `organizations.settings.meetings` (UI: `/meetings/settings`).

Defaults (timezone `Europe/London`):

- Daily standup **07:00**
- Weekly marketing **Monday 08:00**
- Quarterly board **first Monday of quarter 09:00**
- Annual review **first Monday of January 09:00**

Hourly Inngest job `meetings/hourly-scheduler` creates due meetings per brand (idempotent per local day+type), then emits `meetings/run`.

## Typed actions

Meeting agents emit `action_type` + `payload`. After the meeting:

- **Autonomous** brands: `authorizeAgentAction()` may execute pause/budget/content-mix
- **Approval** mode: actions land in the recommendations feed / awaiting-approval list
- Minutes always include **Actions taken** and **Actions awaiting approval**

## Escalation

If a brand KPI is **>25% off target for 2 consecutive weekly marketing meetings**, the meeting is flagged and org admins are notified (any mode).

## Jobs

| Function | Trigger |
|----------|---------|
| `meetings/hourly-scheduler` | cron `5 * * * *` |
| `meetings/run` | event `meetings/run` |

## Product features

- Upcoming calendar + past feed at `/meetings`
- Comments + “Ask about this meeting” chat
- Convert action → `campaign_tasks`
- Sparse-data disclosure when live metrics are missing

See migrations `00010_meetings_module.sql` and `00026_meetings_with_teeth.sql`.
