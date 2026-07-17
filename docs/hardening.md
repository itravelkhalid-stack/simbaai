# Hardening (Phase 18)

## Security

| Control | Location |
|---------|----------|
| RLS audit | `scripts/audit-rls.sql`, `npm run audit:rls` |
| Rate limits | `lib/security/rate-limit.ts` via `middleware.ts` |
| CSRF / same-origin | `lib/security/csrf.ts` (webhooks/OAuth exempt) |
| Zod FormData helper | `lib/security/validate.ts` |
| AES token crypto | `lib/crypto.ts` (`server-only`) |
| Admin client fence | `lib/supabase/admin.ts` (`server-only`) |
| Analytics SQL whitelist | `lib/data/query-layer.ts` + unit tests |
| Public webhook allowlist | Stripe, CRM, automations, Resend, Inngest in middleware |

## Resilience

| Control | Location |
|---------|----------|
| Retry + circuit breaker | `lib/security/http.ts` |
| Dead-letter queue | `job_dead_letters` + `/admin/jobs` |
| Integration health banners | `integration_health` + dashboard banners |
| Inngest health snapshot | `jobs/integration-health` cron |

## Tests

```bash
npm run test                 # Vitest unit (+ skipped RLS if no creds)
npm run test:integration     # RLS boundary (needs test users)
npm run test:e2e             # Playwright critical path
```

## Performance

- Index audit migration `00018_hardening_dlq_indexes.sql`
- Pagination helper: `paginationSchema` / `paginationRange` in `lib/security/validate.ts`
- Route `loading.tsx` for dashboard, admin, content
- `next/image` remote patterns in `next.config.ts`

## Deploy docs

- `docs/env.md`
- `docs/staging.md`
- `docs/launch-checklist.md`
- `vercel.json`
