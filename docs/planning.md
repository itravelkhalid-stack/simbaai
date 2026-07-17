# Marketing planning & execution

Module path: `/planning`

## Flow

1. Generate a plan from a business goal (AI Marketing Planner).
2. Approve each document section (objectives → strategies → campaigns → tactics → budget → KPIs → tasks).
3. **Approve plan & create campaigns** materializes:
   - `campaigns` + `campaign_tasks`
   - Linked module work: Content agent runs, Ads media plan drafts, Email campaign drafts, SEO briefs
4. Campaign hub shows KPI bars (live from ads/email/seo metrics), kanban, budget, activity.
5. Daily Inngest job runs due AI tasks and refreshes KPIs. Humans get `notifications` (+ optional Resend email).

## Jobs

| Function | Trigger |
|----------|---------|
| `planning/daily-execution` | cron 06:00 UTC |
| `planning/execute-task-now` | event `planning/task.execute` |

## Tables

- `marketing_plans` — period, document, section_approvals
- `campaigns` — KPI jsonb, budget_pence / spent_pence
- `campaign_tasks` — module, assignee_type ai/human, linked_entity
- `campaign_activities` — feed
- `notifications` — per-user task alerts

See migration `00009_planning_module.sql`.
