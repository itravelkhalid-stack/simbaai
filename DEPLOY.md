# GrowthOS — Vercel + GoDaddy deploy guide

Replace `MYDOMAIN.com` with your real domain everywhere below. Production app host assumed: `https://app.MYDOMAIN.com`.

## Pre-deploy verification (done in repo)

| Check | Result |
| --- | --- |
| `npm run build` | Passed |
| Hardcoded production localhost URLs | None in app code. Localhost appears only as a **fallback** when `NEXT_PUBLIC_SITE_URL` is unset (`?? "http://localhost:3000"`). Set the env var in Vercel. |
| OAuth redirect URIs | Built from `NEXT_PUBLIC_SITE_URL`, not request `Host` headers |
| Secrets in git | `.env*` ignored; no API keys hardcoded in source |
| Inngest | Client is `new Inngest({ id: "growthos" })` with no local-only base URL. Production needs Inngest Cloud + keys below |

---

## 1. Environment variable manifest

Only variables actually read by app/scripts/tests (or by the Inngest SDK used by `/api/inngest`). Framework vars (`NODE_ENV`, `CI`, `NEXT_RUNTIME`) are omitted.

**In your `.env.local` today:** `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DATABASE_URL`, `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `OAUTH_STATE_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY`, `TOKEN_ENCRYPTION_KEY`.

### Required for core (app boots, auth, AI jobs, encryption)

| Variable | In `.env.local`? | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser + server RLS client |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server admin client — never expose to browser |
| `NEXT_PUBLIC_SITE_URL` | Yes (localhost) | Set to `https://app.MYDOMAIN.com` after DNS is live |
| `TOKEN_ENCRYPTION_KEY` | Yes | 32-byte key, base64 — encrypts OAuth tokens |
| `OAUTH_STATE_SECRET` | Yes | Signs OAuth `state` (falls back to `TOKEN_ENCRYPTION_KEY` if unset) |
| `ANTHROPIC_API_KEY` | Yes | All agent / content generation |
| `INNGEST_EVENT_KEY` | No | Read by Inngest SDK (not referenced in app source). Required for Cloud |
| `INNGEST_SIGNING_KEY` | No | Read by Inngest SDK. Required for Cloud webhook verification |

### Required per integration (feature fails without these when you use that feature)

| Variable | In `.env.local`? | Integration |
| --- | --- | --- |
| `RESEND_API_KEY` | Yes | Transactional email (invites, notifications) |
| `RESEND_FROM_EMAIL` | Yes | From address for Resend |
| `META_APP_ID` | Yes | Facebook + Instagram social (+ Meta ads OAuth) |
| `META_APP_SECRET` | Yes | Same (also signs Meta webhook POSTs) |
| `META_WEBHOOK_VERIFY_TOKEN` | Yes | Meta webhook GET verification at `/api/social/webhooks/meta` |
| `META_REQUEST_IG_SCOPES` | No | Set to `true` to request Instagram OAuth scopes (off by default) |
| `X_CLIENT_ID` | No | X (Twitter) social + ads OAuth |
| `X_CLIENT_SECRET` | No | X OAuth token exchange |
| `LINKEDIN_CLIENT_ID` | No | LinkedIn social |
| `LINKEDIN_CLIENT_SECRET` | No | LinkedIn social |
| `LINKEDIN_ORG_ENABLED` | No | Set `true` for org Page scopes/posting (Community Management API) |
| `TIKTOK_CLIENT_KEY` | No | TikTok social |
| `TIKTOK_CLIENT_SECRET` | No | TikTok social |
| `PINTEREST_APP_ID` | No | Pinterest social |
| `PINTEREST_APP_SECRET` | No | Pinterest social |
| `GOOGLE_CLIENT_ID` | No | YouTube social, GSC, GA4, Google Ads OAuth |
| `GOOGLE_CLIENT_SECRET` | No | Same |
| `TIKTOK_ADS_APP_ID` | No | TikTok Ads OAuth |
| `TIKTOK_ADS_SECRET` | No | TikTok Ads OAuth |
| `MICROSOFT_ADS_CLIENT_ID` | No | Microsoft Advertising OAuth gate |
| `MICROSOFT_ADS_CLIENT_SECRET` | No | Microsoft Advertising OAuth gate |
| `STRIPE_SECRET_KEY` | No | Billing |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhooks |
| `STRIPE_PRICE_STARTER` | No | Maps Stripe price → plan |
| `STRIPE_PRICE_GROWTH` | No | Maps Stripe price → plan |
| `STRIPE_PRICE_AGENCY` | No | Maps Stripe price → plan |
| `CRM_WEBHOOK_SECRET` | No | Optional global CRM webhook HMAC (org secrets also supported) |
| `PAGESPEED_API_KEY` | No | SEO PageSpeed audits |
| `GOOGLE_PAGESPEED_API_KEY` | No | Alias for `PAGESPEED_API_KEY` |

### Optional

| Variable | In `.env.local`? | Notes |
| --- | --- | --- |
| `ANTHROPIC_MODEL` | Yes | Defaults to `claude-sonnet-4-6` if unset |
| `EMAIL_UNSUBSCRIBE_SECRET` | No | Campaign unsubscribe tokens; falls back to `TOKEN_ENCRYPTION_KEY` |
| `ADS_WRITES_ENABLED` | No | Must be `"true"` to allow live ad writes |
| `SEO_AUDIT_PAGE_CAP` | No | Defaults to `40` |
| `SENTRY_DSN` | No | Server/edge Sentry |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Client Sentry |
| `SENTRY_ORG` | No | Sentry build upload |
| `SENTRY_PROJECT` | No | Sentry build upload |
| `DATABASE_URL` | Yes | Local migration / RLS scripts only — not required on Vercel runtime |
| `SUPABASE_DB_PASSWORD` | Yes | Same (scripts) |
| `SUPABASE_DB_URL` | No | Alias used by `scripts/audit-rls.ts` |
| `SUPABASE_POOLER_REGION` | No | Migration helper default `eu-central-1` |
| `PLAYWRIGHT_BASE_URL` | No | E2E only |
| `PLAYWRIGHT_SKIP_WEBSERVER` | No | E2E only |
| `PLAYWRIGHT_SMOKE_EMAIL` | No | E2E only |
| `PLAYWRIGHT_SMOKE_PASSWORD` | No | E2E only |
| `GROWTHOS_TEST_USER_A_EMAIL` | No | Integration tests |
| `GROWTHOS_TEST_USER_A_PASSWORD` | No | Integration tests |
| `GROWTHOS_TEST_USER_B_EMAIL` | No | Integration tests |
| `GROWTHOS_TEST_USER_B_PASSWORD` | No | Integration tests |
| `INNGEST_SIGNING_KEY_FALLBACK` | No | Inngest SDK key rotation helper |

**Minimum Vercel Production set to copy from `.env.local` now:** all “Yes” core rows except keep `NEXT_PUBLIC_SITE_URL` as the Vercel URL first (or custom domain once DNS works), plus add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` from Inngest Cloud after signup.

Do **not** put `DATABASE_URL` / `SUPABASE_DB_PASSWORD` on Vercel unless you intentionally run DB scripts there.

---

## 2. OAuth callback URLs (paste into developer consoles)

Base: `https://app.MYDOMAIN.com`

### Social (Meta, X, LinkedIn, TikTok, Pinterest, Google/YouTube)

| Platform | Callback URL |
| --- | --- |
| Meta / Facebook | `https://app.MYDOMAIN.com/api/social/oauth/facebook/callback` |
| Meta / Instagram | `https://app.MYDOMAIN.com/api/social/oauth/instagram/callback` |
| X | `https://app.MYDOMAIN.com/api/social/oauth/x/callback` |
| LinkedIn | `https://app.MYDOMAIN.com/api/social/oauth/linkedin/callback` |
| TikTok | `https://app.MYDOMAIN.com/api/social/oauth/tiktok/callback` |
| Pinterest | `https://app.MYDOMAIN.com/api/social/oauth/pinterest/callback` |
| Google (YouTube) | `https://app.MYDOMAIN.com/api/social/oauth/youtube/callback` |

### Related Google OAuth redirects (same Google client if shared)

| Feature | Callback URL |
| --- | --- |
| Google Search Console | `https://app.MYDOMAIN.com/api/seo/gsc/callback` |
| GA4 | `https://app.MYDOMAIN.com/api/data/ga4/callback` |
| Google Ads | `https://app.MYDOMAIN.com/api/ads/oauth/google/callback` |

### Other ads OAuth callbacks (if enabling those platforms)

| Platform | Callback URL |
| --- | --- |
| Meta Ads | `https://app.MYDOMAIN.com/api/ads/oauth/meta/callback` |
| X Ads | `https://app.MYDOMAIN.com/api/ads/oauth/x/callback` |
| TikTok Ads | `https://app.MYDOMAIN.com/api/ads/oauth/tiktok/callback` |
| Microsoft Ads | `https://app.MYDOMAIN.com/api/ads/oauth/bing/callback` |

### Supabase Auth redirects

| Purpose | URL |
| --- | --- |
| Site URL | `https://app.MYDOMAIN.com` |
| Auth callback | `https://app.MYDOMAIN.com/callback` |
| Password reset | `https://app.MYDOMAIN.com/reset-password` |

---

## 3. Vercel + GoDaddy DNS (click-by-click)

### A. Import repo on Vercel

1. Open [https://vercel.com](https://vercel.com) → log in (GitHub).
2. **Add New…** → **Project**.
3. Import the private `growthos` GitHub repo.
4. Framework: **Next.js** (auto-detected). Leave build command `next build`, output default.
5. **Do not deploy yet** — open **Environment Variables** first.

### B. Add environment variables

1. In the Vercel project → **Settings** → **Environment Variables**.
2. Add every **Required for core** row for **Production** (and Preview if you want preview deploys).
3. For first deploy before custom DNS: set `NEXT_PUBLIC_SITE_URL` to the Vercel URL Vercel shows (e.g. `https://growthos-xxxx.vercel.app`) **or** wait until the custom domain is attached and set `https://app.MYDOMAIN.com` then redeploy.
4. Add integration vars you need now (at least Meta + Resend if you will smoke-test those).
5. Save.

### C. Deploy

1. **Deployments** → **Redeploy** the latest commit, or push to the connected branch.
2. Wait until status is **Ready**. Open the `.vercel.app` URL and confirm the login page loads.

### D. Add custom domain in Vercel

1. Project → **Settings** → **Domains**.
2. Add `app.MYDOMAIN.com`.
3. Vercel will show DNS instructions — use the CNAME below.

### E. GoDaddy DNS — exact CNAME

1. Log in to [GoDaddy](https://www.godaddy.com) → **My Products** → your domain → **DNS** / **Manage DNS**.
2. **Add** a record:
   - **Type:** `CNAME`
   - **Name / Host:** `app`
   - **Value / Points to:** `cname.vercel-dns.com`  
     (If Vercel shows a project-specific target like `cname.vercel-dns.com` or a `*.vercel-dns.com` host, use **exactly** what Vercel displays for this domain.)
   - **TTL:** 1 hour (or default)
3. Remove any conflicting `A` / `AAAA` / `CNAME` already on `app`.
4. Wait for DNS (often minutes; can be up to ~48h). In Vercel Domains, wait until `app.MYDOMAIN.com` shows **Valid**.

### F. Update `NEXT_PUBLIC_SITE_URL` after domain is live

1. Vercel → **Settings** → **Environment Variables**.
2. Edit `NEXT_PUBLIC_SITE_URL` → `https://app.MYDOMAIN.com` (no trailing slash).
3. **Deployments** → **Redeploy** (required so the public env is baked into the client bundle).

### G. Meta app domains + Facebook Login redirect URIs

1. [Meta for Developers](https://developers.facebook.com) → your app.
2. **App settings** → **Basic** → **App Domains:** add `app.MYDOMAIN.com` only (domain, not full URL).
3. **Facebook Login for Business** → **Settings** → **Valid OAuth Redirect URIs** — add both:
   - `https://app.MYDOMAIN.com/api/social/oauth/facebook/callback`
   - `https://app.MYDOMAIN.com/api/social/oauth/instagram/callback`
4. If the app is **Live**, HTTPS production URLs are required (localhost only works in Development).
5. Save changes.

### H. Supabase Auth URL configuration

1. Supabase Dashboard → your project → **Authentication** → **URL Configuration**.
2. **Site URL:** `https://app.MYDOMAIN.com`
3. **Redirect URLs** — include:
   - `https://app.MYDOMAIN.com/callback`
   - `https://app.MYDOMAIN.com/reset-password`
   - `https://app.MYDOMAIN.com/**` (optional catch-all if you use wildcards)
4. Save.

### I. Inngest Cloud

1. Sign up / log in at [https://app.inngest.com](https://app.inngest.com).
2. Create an app (or use default) matching this codebase’s Inngest app id: `growthos`.
3. **Sync / Apps** → add the serve URL:  
   `https://app.MYDOMAIN.com/api/inngest`
4. Open **Manage** → **Keys** (or Environment → Keys):
   - Copy **Event Key** → Vercel env `INNGEST_EVENT_KEY`
   - Copy **Signing Key** → Vercel env `INNGEST_SIGNING_KEY`
5. Redeploy Vercel after adding both keys.
6. In Inngest, confirm the app sync succeeds (functions from `/api/inngest` listed).

---

## 4. Post-deploy smoke test checklist

Run on `https://app.MYDOMAIN.com`:

- [ ] **Signup** — create a new user; email/password (or Google) completes without redirect errors
- [ ] **Org creation** — onboarding creates an organization; dashboard loads for that org
- [ ] **Content generation job** — start a content (or research) AI job; status moves `queued` → `running` → `complete` (proves Inngest Cloud is wired). If it stays queued forever, re-check Inngest sync URL + `INNGEST_*` keys + redeploy
- [ ] **Meta connect** — Social → Connect Facebook/Instagram → Meta authorize → returns to app (page picker or `/social`) **without** a `redirect_uri` / domain mismatch error

---

## 5. GitHub CLI (if push was blocked on auth)

`gh` is installed at `~/.local/bin/gh` but was **not** logged in when this guide was written.

1. In your terminal:

```bash
export PATH="$HOME/.local/bin:$PATH"
gh auth login
```

2. Choose: **GitHub.com** → **HTTPS** → authenticate via **browser** (recommended) → allow access.
3. Then from the repo:

```bash
cd /Users/khalidmohamed/Projects/growthos
export PATH="$HOME/.local/bin:$PATH"
gh repo create growthos --private --source=. --remote=origin --push
```

If the repo name is taken, use `growthos-app` or `youruser/growthos`. If `origin` already exists, use:

```bash
gh repo create growthos --private --push
```

or `git push -u origin HEAD` after `gh repo create ... --remote=origin`.
