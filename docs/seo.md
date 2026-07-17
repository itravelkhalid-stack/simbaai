# SEO module (Google Search Console + audits)

GrowthOS SEO lives under `/seo` with projects per domain.

## Env

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | GSC OAuth (same Google app as YouTube is fine) |
| `PAGESPEED_API_KEY` or `GOOGLE_PAGESPEED_API_KEY` | PageSpeed Insights for audits |
| `SEO_AUDIT_PAGE_CAP` | Max pages per crawl (default 40) |

OAuth redirect: `{SITE_URL}/api/seo/gsc/callback`

Enable Search Console API on the Google Cloud project and add the redirect URI. Scope used: `https://www.googleapis.com/auth/webmasters.readonly`.

## Inngest jobs

| Function | Schedule / event |
|----------|------------------|
| `seo/sync-gsc-daily` | cron 05:00 UTC |
| `seo/sync-gsc-project` | event `seo/gsc.sync` |
| `seo/run-technical-audit` | event `seo/audit.run` |
| `seo/weekly-summary` | Monday 09:00 UTC → `seo_weekly_summaries` (Reviews consumes this) |

## Pipeline

1. Create project with domain
2. Connect GSC → pick property → Sync
3. AI keyword strategy → edit pillar/cluster JSON → Create brief
4. Draft article → markdown edit + on-page checklist → Approve
5. Run technical audit (robots.txt respected, PageSpeed on first pages)

## Reviews handoff

`seo_weekly_summaries` stores AI summaries (`summary_markdown`, `highlights`, `metrics`) keyed by `project_id` + `week_start` for the Reviews module.
