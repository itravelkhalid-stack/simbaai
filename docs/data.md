# Data & Analytics

Module path: `/data`

Unified analytics layer over module metrics, GA4 enrichment, ask-your-data, and anomaly alerts.

## Tables

- `analytics_daily` — materialised rollups per org/brand/date/channel
- `ga4_connections` — OAuth tokens (AES-256-GCM) + property id
- `analytics_ga4_daily` — sessions/conversions by source/medium
- `analytics_anomalies` — flagged deviations + AI context
- `analytics_chat_messages` — ask-your-data history (includes chart JSON)

Migration: `00014_data_analytics_module.sql`

## Nightly rollup

Inngest `analytics/nightly-rollup` (04:30 UTC):

1. Sync all active GA4 connections (last 14 days)
2. Rebuild `analytics_daily` from:
   - `ad_metrics_daily` (+ campaign platform → channel)
   - `content_metrics`
   - `email_events`
   - `seo_gsc_daily`
   - `crm_contacts` / `crm_orders`
   - `revenue_records`
   - `analytics_ga4_daily` → `web` channel sessions/conversions

On-demand: event `analytics/rollup.run` or **Rebuild rollups** on the dashboard.

## Dashboard

`/data` — date range + compare prior period:

- Funnel: impressions → clicks → leads → sales
- Channel mix + ROAS
- Daily sessions/clicks trend
- Top content / top campaigns
- Cohort: revenue by contact acquisition month (when store/CRM orders exist)
- Anomaly feed with acknowledge
- Ask-your-data chat

## GA4 OAuth

`/data/settings` → Connect GA4 (Google OAuth, Analytics read-only).

Callback: `/api/data/ga4/callback`

Pulls sessions, conversions, source/medium daily into `analytics_ga4_daily`.

Env: reuses `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (enable Analytics APIs on the client).

## Ask-your-data

Claude plans a **whitelisted** `query_id` + params (`lib/data/query-layer.ts`).  
Server always injects `organization_id` via admin client filters — never freeform SQL, never raw table access from the model.

Response: natural-language answer **and** chart.

## Anomalies

Inngest `analytics/daily-anomalies` (06:00 UTC):

- Spend spikes vs 7-day average
- Session/traffic drops
- CTR collapses

Writes `analytics_anomalies`, notifies org owners/admins (`notifications` + optional Resend), with Claude-written likely-cause context.
