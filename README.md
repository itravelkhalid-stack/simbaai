# GrowthOS

Multi-tenant AI marketing agency platform.

## Stack

- Next.js 15 App Router + TypeScript (strict) + Tailwind CSS + shadcn/ui
- Supabase (Auth, Postgres, RLS)
- Resend for invitation emails
- Inngest for background agent jobs
- Anthropic Claude for research + content agents

## Setup

1. Copy env vars:

```bash
cp .env.example .env.local
```

2. Create a Supabase project and paste `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`.

3. In the Supabase SQL editor, run migrations in order under `supabase/migrations/`.

4. Auth providers in Supabase:
   - Email/password enabled
   - Confirm email enabled
   - Google OAuth configured with redirect URL: `http://localhost:3000/callback`
   - Reset password redirect: `http://localhost:3000/reset-password`

5. Install and run:

```bash
npm install
npm run dev
npm run inngest:dev
```

## Research module

1. Run migrations `00002_brand_foundation.sql` and `00003_research_engine.sql`.
2. Set `ANTHROPIC_API_KEY` and Inngest keys in `.env.local`.
3. Open `/research` → New research → watch live progress on the project page.

## Content module

1. Run migration `00004_content_module.sql`.
2. Configure pillars at `/content/pillars`.
3. Generate at `/content/generate` (single/script or 2-week batch).
4. Review at `/content/queue`, schedule via `/content/calendar` (drag-and-drop).

## Social publishing

1. Run migration `00005_social_publishing.sql`.
2. Set `TOKEN_ENCRYPTION_KEY` (32-byte base64) and provider OAuth credentials.
3. Follow `docs/integrations.md` to create Meta / X / LinkedIn / TikTok / Pinterest / YouTube apps.
4. Connect accounts at `/settings/connections`.
5. Keep `npm run inngest:dev` running so the 5-minute publisher and daily metrics jobs execute.

## Structure

- `app/(auth)` — login, signup, password reset, OAuth callback, invite acceptance
- `app/(dashboard)` — tenant workspace modules
- `app/(admin)/admin` — platform admin surface
- `lib/supabase` — browser + server clients
- `lib/brand/context.ts` — `getBrandContext()` for all content agents
- `lib/agents/prompts` — versioned agent prompts
- `supabase/migrations` — SQL + RLS
