# Platform admin, onboarding & notifications

Migration: `00017_admin_onboarding_notifications.sql`

## Platform admin (`/admin`)

Gated by `platform_admins` / `is_platform_admin()`.

| Page | Purpose |
|------|---------|
| `/admin` | Org list with plan, usage, AI spend; impersonate |
| `/admin/orgs/[id]` | Plan override + feature flags |
| `/admin/agents` | Global agent-run monitor (error rate, cost/model) |
| `/admin/announcements` | Platform-wide banner CRUD |

**Impersonation:** sets `growthos_impersonate_org` cookie, writes `audit_events` (`impersonation_start` / `impersonation_end`), shows support banner in the dashboard.

## Client onboarding

Checklist after org creation (dashboard until complete or dismissed):

1. Set up brand → `/brand`
2. AI brand extraction → `/research/new?type=brand_audit`
3. Connect first social → `/settings/connections`
4. First research → `/research/new`
5. Approve first content → `/content/queue`
6. Schedule first report → `/reviews/settings`

Progress is auto-detected from org data; steps can also be marked done manually. Stored in `org_onboarding_progress`.

## Notifications

- Table `notifications` (+ `category` enum)
- In-app bell in dashboard header with Supabase realtime INSERT
- `notification_preferences` — per-user email: `immediate` / `daily` / `off` by category
- Categories: approvals, blockers, anomalies, reports, meetings, general
- Daily digest Inngest cron `0 8 * * *` (`notifications/daily-digest`)
- Org Slack incoming webhook in `org_notification_settings` (settings → Notifications)

Primary writer: `lib/notifications/notify.ts` → `notifyUser` / `notifyOrgAdmins`.
