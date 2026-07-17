# Reviews & reporting

Module path: `/reviews`

Performance reports at daily / weekly / monthly / quarterly cadence, measured against each brand’s configured north-star KPIs.

## Flow

1. Configure **KPIs** at `/reviews/kpis` (targets + north-star flags).
2. Configure **schedule & branding** at `/reviews/settings` (per brand, UTC hours, auto-email recipients, colours/logo).
3. Reports generate via Inngest (or “Generate report now”).
4. Open a report for charts (Recharts), insights, PDF export, and optional email.

## Report sections

- Headline numbers with period-over-period deltas
- Channel breakdown (content, ads, email, SEO; CRM revenue uses attributed ad revenue until CRM ships)
- Campaign performance vs KPI
- Insights + recommendations
- Quarterly only: plan retrospective + next-quarter proposals

## Jobs

| Function | Trigger |
|----------|---------|
| `reviews/hourly-scheduler` | cron `10 * * * *` |
| `reviews/run` | event `reviews/run` |

Defaults: daily overnight (05:00 UTC), weekly Mon 08:00, monthly day 1 09:00, quarterly on quarter-start 10:00.

## Tables

- `brand_kpis` — north-star metrics & targets
- `brand_report_settings` — schedule, recipients, branding
- `reports` — content jsonb, pdf_url, sent_to
- Storage bucket `reports` for PDFs

See migration `00011_reviews_module.sql`.
