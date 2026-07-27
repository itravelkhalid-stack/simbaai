# Finance

Module path: `/finance`

Client marketing finance (budgets, expenses, revenue) plus GrowthOS platform billing (Stripe).

## Client finance

### Tables
- `budgets` — period + channel planned_pence
- `expenses` — auto_ads / auto_platform / manual
- `revenue_records` — shopify / woo / crm / manual
- `brand_finance_settings` — COGS % for gross margin
- `finance_weekly_summaries` — AI analyst output

### Auto-ingestion
Daily Inngest `finance/daily-ingestion` (05:20 UTC):
- `ad_metrics_daily` → expenses per ad platform channel
- `agent_runs` cost → platform expenses
- CRM orders + won deals → revenue_records

### Dashboard
- Budget vs actual + burn-rate pacing
- Blended ROAS, MER, CAC
- Monthly marketing P&L (spend, revenue, COGS, margin)
- CSV export `/api/finance/export?brandId=`
- Weekly AI Finance analyst → Ads `shift_budget` recommendations

## Platform billing

- Org fields: `stripe_customer_id`, `stripe_subscription_id`, `plan`, period dates
- Plans: free / starter / growth / agency / **internal** — limits in `PLAN_LIMITS`
- `internal` is for platform-owned and demo orgs only (unlimited quotas). Not on Stripe Checkout; set via Admin Portal (`/admin/orgs/[id]`) or migration.
- `checkPlanLimit(orgId, key)` / `assertPlanAllows` in `lib/billing/plans.ts`
- Checkout + Customer Portal + webhook `/api/stripe/webhook`
- Invoices on `/finance/billing`

### AI run metering (`ai_runs_month`)

Counted toward quota:
- `agent_runs` where `metered = true` and `status <> 'failed'` in the current UTC month

Not counted:
- Failed runs
- System / background agents (`media_vision_tag`, `social_publisher`, `email_sender`, cron digests like `organic_growth`, `ads_optimisation`, `pipeline_review`, `finance_analyst`, `seo_weekly_summary`) — see `lib/billing/metering.ts` and `agent_runs.metered`

Inserts should set `metered` via `isMeteredAgentName` / `withAgentRun`.

### Env
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_AGENCY=
```

See migration `00013_finance_module.sql`.
