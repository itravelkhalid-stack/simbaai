# Inngest cron inventory

All crons are registered via `app/api/inngest/route.ts` and run on **Inngest Cloud** against the production `/api/inngest` endpoint (not the local CLI). Local `npm run inngest:dev` is only for development.

| Function ID | Cron (UTC) | Purpose |
|-------------|------------|---------|
| `social/publish-due` | `*/5 * * * *` | Publish due social posts |
| `email/send-due` | `*/5 * * * *` | Send due email campaigns |
| `automations/tick` | `*/5 * * * *` | Automation runner |
| `meetings/hourly-scheduler` | `5 * * * *` | Queue due AI meetings |
| `reviews/hourly-scheduler` | `10 * * * *` | Queue due brand reports |
| `jobs/integration-health` | `15 * * * *` | Integration health checks |
| `compliance/process-deletions` | `15 3 * * *` | GDPR deletion processing |
| `analytics/daily-rollups` | `30 4 * * *` | Analytics rollups |
| `seo/daily-sync` | `0 5 * * *` | SEO / GSC sync |
| `finance/daily-ingestion` | `20 5 * * *` | Finance ingestion |
| `social/daily-metrics` | `0 6 * * *` | Content metrics pull |
| `analytics/detect-anomalies` | `0 6 * * *` | Anomaly detection |
| `planning/daily` | `0 6 * * *` | Planning jobs |
| `ads/ingest-daily-metrics` | `0 7 * * *` | Ad metrics sync |
| `automations/morning` | `10 7 * * *` | Morning automations |
| `crm/weekly-pipeline` | `0 7 * * 1` | Weekly CRM pipeline |
| `ads/daily-optimisation` | `0 8 * * *` | Ads recommendations / autonomous opts |
| `notifications/daily-digest` | `0 8 * * *` | Email digests |
| `finance/weekly-analyst` | `0 8 * * 1` | Finance weekly analyst |
| `content/weekly-growth-review` | `0 9 * * 1` | Organic growth agent |
| `seo/weekly-summary` | `0 9 * * 1` | SEO weekly summary |

## Verify production last-run

1. Open [Inngest dashboard](https://app.inngest.com) → your GrowthOS app.
2. Confirm the app URL is `https://<your-host>/api/inngest`.
3. For each function above, open **Runs** and check the latest successful timestamp.
4. If a function never ran: check Vercel env `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`, then sync apps in Inngest.

Nothing in this list is local-only; all use the shared `inngest` client from `lib/inngest/client.ts`.
