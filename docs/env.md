# Environment variables

Canonical reference for GrowthOS. Also see `.env.example`.

## Required (all environments)

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + RLS client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin client — never expose to browser |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (auth redirects, OAuth, invites) |
| `TOKEN_ENCRYPTION_KEY` | 32-byte key, base64 — AES-256-GCM for OAuth tokens |
| `OAUTH_STATE_SECRET` | HMAC secret for OAuth `state` (falls back to encryption key) |
| `ANTHROPIC_API_KEY` | Claude agents |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-6` |

## Background jobs (Inngest)

GrowthOS uses **Inngest** (not Trigger.dev).

| Variable | Notes |
|----------|--------|
| `INNGEST_EVENT_KEY` | Production event key |
| `INNGEST_SIGNING_KEY` | Verifies `/api/inngest` |

Deploy: sync the Next.js app to Vercel, then register the app URL in the Inngest dashboard (`https://<host>/api/inngest`). Local: `npm run inngest:dev`.

## Email

| Variable | Notes |
|----------|--------|
| `RESEND_API_KEY` | Transactional + marketing |
| `RESEND_FROM_EMAIL` | Verified sender |
| `RESEND_WEBHOOK_SECRET` | Resend webhook verification |
| `EMAIL_UNSUBSCRIBE_SECRET` | Signed unsubscribe tokens |

## Billing

| Variable | Notes |
|----------|--------|
| `STRIPE_SECRET_KEY` | Server only |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` |
| `STRIPE_PRICE_STARTER` / `GROWTH` / `AGENCY` | Price IDs |

## Social / ads / Google

See `.env.example` and `docs/integrations.md`, `docs/ads-apis.md`. Notable:

- `ADS_WRITES_ENABLED=false` until live ads write approval
- `GOOGLE_ADS_DEVELOPER_TOKEN` + optional `GOOGLE_ADS_LOGIN_CUSTOMER_ID` for Google Ads reads
- `CRM_WEBHOOK_SECRET` for public CRM form/webhooks
- `PAGESPEED_API_KEY` for SEO audits

## Observability

| Variable | Notes |
|----------|--------|
| `NEXT_PUBLIC_SENTRY_DSN` | Browser + shared DSN |
| `SENTRY_DSN` | Server/edge (optional override) |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | Source maps upload on Vercel build |

Sentry is **disabled** when no DSN is set (local/default).

## Testing

| Variable | Notes |
|----------|--------|
| `GROWTHOS_TEST_USER_A_EMAIL` / `_PASSWORD` | RLS integration user A |
| `GROWTHOS_TEST_USER_B_EMAIL` / `_PASSWORD` | RLS integration user B (other org) |
| `PLAYWRIGHT_SMOKE_EMAIL` / `_PASSWORD` | E2E signup smoke |
| `PLAYWRIGHT_BASE_URL` | Default `http://127.0.0.1:3000` |
| `DATABASE_URL` | Optional for `npm run audit:rls -- --execute` |

## Client vs server

**Allowed in client bundles:** only `NEXT_PUBLIC_*`.

**Never** import `@/lib/crypto`, `@/lib/supabase/admin`, or service-role keys into Client Components. Those modules use `server-only`.
