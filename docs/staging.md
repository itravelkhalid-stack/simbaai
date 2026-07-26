# Staging & deployment

## Environments

| Env | Supabase | Vercel | Inngest | Stripe |
|-----|----------|--------|---------|--------|
| Local | local or shared staging project | `npm run dev` | `npm run inngest:dev` | test keys |
| Staging | dedicated Supabase project | Vercel Preview or `staging` branch | Staging app in Inngest | test mode |
| Production | production Supabase | Vercel Production | Production Inngest app | live mode |

## Vercel

1. Import the GitHub repo; framework preset Next.js.
2. Set env vars from `docs/env.md` (Production + Preview separately).
3. `vercel.json` sets security headers; region default `iad1` (adjust as needed).
4. Deploy: push to `main` (prod) / PR previews (staging-like).

Optional: create a Vercel **Staging** environment mapped to branch `staging` with staging Supabase + Stripe test keys.

## Supabase migrations

```bash
# Preferred: apply via tracked migrator (writes public + supabase_migrations.schema_migrations)
npx tsx scripts/apply-migrations.ts

# Full CLI link (needs SUPABASE_ACCESS_TOKEN from Dashboard → Account → Access Tokens)
npx supabase link --project-ref <ref> --password "$SUPABASE_DB_PASSWORD"
npx supabase db push
```

`scripts/apply-migrations.ts` skips already-applied files and dual-writes:
- `public.schema_migrations` (legacy filename tracker)
- `supabase_migrations.schema_migrations` (official CLI versions)

Always apply migrations to **staging first**, smoke-test, then production.

Brand media storage access model: see `docs/brand-media-storage.md` (private bucket + signed URLs at publish).

RLS audit after migrate:

```bash
psql "$DATABASE_URL" -f scripts/audit-rls.sql
# or
npm run audit:rls
```

## Inngest deployment

1. Create apps for staging and production in the Inngest dashboard.
2. Set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` per environment.
3. Sync URL: `https://<vercel-host>/api/inngest`.
4. Confirm crons appear (reviews, digests, integration health, automations).

There is **no Trigger.dev** in this repo — jobs run on Inngest.

## Sentry

1. Create a Sentry project (Next.js).
2. Set `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` on Vercel.
3. Redeploy — `instrumentation.ts` + `withSentryConfig` activate when DSN is present.

## Staging checklist

- [ ] Staging Supabase with all migrations
- [ ] Preview/staging env vars (no live Stripe/Meta secrets)
- [ ] Inngest staging sync
- [ ] `npm run test` green
- [ ] RLS audit clean
- [ ] Smoke: signup → org → brand → content queue
- [ ] Webhooks reachable: Stripe, Resend, CRM, automations (middleware allowlist)
