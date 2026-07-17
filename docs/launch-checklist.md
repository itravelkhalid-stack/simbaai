# Launch checklist

## Engineering (pre-launch)

- [ ] `npm run build` green
- [ ] `npm run test` green
- [ ] `scripts/audit-rls.sql` shows no `RLS_DISABLED` / `NO_POLICIES`
- [ ] Migration `00018` applied (DLQ + indexes + integration_health)
- [ ] Rate limits + CSRF origin checks verified on staging
- [ ] Sentry receiving test errors
- [ ] Inngest production sync + dead-letter UI at `/admin/jobs`
- [ ] `TOKEN_ENCRYPTION_KEY` rotated for production (not shared with staging)
- [ ] Stripe webhook endpoint live + signature verified
- [ ] `ADS_WRITES_ENABLED` remains `false` until ads write review complete

## Third-party app reviews & access

### Meta (Facebook / Instagram)

- [ ] Meta App in Live mode
- [ ] App Review for permissions you actually request, typically:
  - `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
  - `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`
  - Ads (if used): `ads_management`, `ads_read`, `business_management`
- [ ] Privacy policy + data deletion URL hosted
- [ ] Business verification if required for advanced access

### TikTok

- [ ] TikTok for Developers app approved
- [ ] **Content Posting API** access (organic publish)
- [ ] **Marketing API** access (ads) — separate approval / Ads app credentials (`TIKTOK_ADS_*`)
- [ ] Redirect URIs match `NEXT_PUBLIC_SITE_URL`

### Google Ads

- [ ] Google Ads API developer token (test → basic → standard)
- [ ] OAuth client with correct redirect URIs
- [ ] MCC / customer account linkage documented for onboarding

### X (Twitter) API

- [ ] Appropriate API tier (pay-per-use / Elevated as needed for posting + metrics)
- [ ] OAuth 2.0 PKCE app credentials (`X_CLIENT_ID` / `X_CLIENT_SECRET`)
- [ ] Confirm write scopes for publishing

### Microsoft Advertising

- [ ] Microsoft Advertising developer token
- [ ] Azure AD app + OAuth client (`MICROSOFT_ADS_*`)
- [ ] Sandbox validation before production

### GA4 + Google Search Console

- [ ] OAuth consent screen verified (or Testing with allowlisted users)
- [ ] Scopes: Analytics read-only (+ Admin if property listing), `webmasters.readonly` for GSC
- [ ] Branding / verification for external users if publishing the OAuth app

### Stripe live mode

- [ ] Activate live account + business details
- [ ] Live price IDs in env (`STRIPE_PRICE_*`)
- [ ] Live webhook secret rotated
- [ ] Tax / customer portal settings reviewed
- [ ] Test a real card charge + invoice email on a dogfood org

## Go-live day

- [ ] Point DNS / `NEXT_PUBLIC_SITE_URL` to production
- [ ] Flip Stripe to live keys
- [ ] Confirm platform admin user seeded in `platform_admins`
- [ ] Post status / announcement banner if needed
- [ ] Monitor Sentry + Inngest + `/admin/agents` for 24h
