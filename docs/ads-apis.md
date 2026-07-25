# Paid ads API integrations

GrowthOS Ads connects to Meta, TikTok, Google Ads, X Ads, and Microsoft Advertising through `/lib/ads/providers`.

## Feature flags

| Env | Purpose |
|-----|---------|
| `ADS_WRITES_ENABLED=true` | Allow create/update/pause/upload across platforms |
| `ADS_WRITES_META=true\|false` | Optional per-platform override |
| `ADS_WRITES_TIKTOK` / `GOOGLE` / `X` / `BING` | Same |

**Default: writes are disabled.** Metrics sync and local campaign records still work. Apply on a recommendation updates GrowthOS state; remote API calls only run when writes are enabled **and** the provider method is implemented.

## Shared interface

Each provider implements:

- `connect` (OAuth and/or manual token)
- `listAccounts`
- `createCampaign` *(stubbed / gated)*
- `updateBudget` *(stubbed / gated)*
- `pauseCampaign` *(stubbed / gated)*
- `uploadCreative` *(stubbed / gated)*
- `fetchDailyMetrics` *(implemented where API access allows)*

OAuth callback: `{SITE_URL}/api/ads/oauth/{platform}/callback`

## Platform status

### Meta Marketing API — metrics-ready

**Env:** `META_APP_ID`, `META_APP_SECRET` (same app as social is fine if scopes include ads).

**Scopes:** `ads_management`, `ads_read`, `business_management`

**Implemented:** OAuth, list ad accounts, campaign insights → `ad_metrics_daily`.

**Writes:** stubbed behind `ADS_WRITES_ENABLED`. To enable create/update you need:

1. App in Live mode with Ads Management standard access
2. Advanced Access for `ads_management` (App Review)
3. Implement Marketing API campaign/ad set/ad create calls in `lib/ads/providers/meta.ts`

### TikTok Marketing API — partial metrics

**Env:** `TIKTOK_ADS_APP_ID`, `TIKTOK_ADS_SECRET` (separate from organic TikTok posting keys).

**Implemented:** OAuth token exchange, advertiser list, integrated report pull (best-effort).

**Writes:** stubbed. Requires TikTok Ads app approval + Marketing API write scopes.

### Google Ads API — OAuth + metrics (reads)

**Env:**

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (OAuth; offline access + refresh tokens)
- `GOOGLE_ADS_DEVELOPER_TOKEN` (required for API calls)
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (optional MCC / manager customer id; strip dashes)
- `GOOGLE_ADS_API_VERSION` (optional; defaults to `v25`)

Google sunsets API versions roughly yearly and a sunset version answers with an
HTML 404 page rather than JSON, which surfaces as `Unexpected token '<'` during
connect. Check [sunset dates](https://developers.google.com/google-ads/api/docs/sunset-dates)
and set `GOOGLE_ADS_API_VERSION` to bump without a code change.

**Implemented:**

- OAuth with `access_type=offline` + `prompt=consent` (refresh token required)
- Token refresh on metrics sync (`ensureFreshAdAccessToken`)
- `customers:listAccessibleCustomers` → account list (non-managers preferred)
- Daily campaign metrics via `googleAds:searchStream` (campaign, date, cost_micros, impressions, clicks, conversions, conversions_value)

**Writes:** stubbed behind `ADS_WRITES_ENABLED`. Leave `false` until campaign mutate paths are implemented.

**Test MCC smoke:**

```bash
# After connecting once (or with a refresh token from OAuth Playground / prior connect):
GOOGLE_ADS_TEST_REFRESH_TOKEN=... npx tsx scripts/test-google-ads-mcc.ts
```

**Docs:** [Google Ads API](https://developers.google.com/google-ads/api/docs/start)

### X Ads API — stub

**Env:** `X_CLIENT_ID`, `X_CLIENT_SECRET` plus Ads API access application.

Organic X OAuth scopes are **not** sufficient for Ads. Apply for [X Ads API](https://developer.x.com/en/docs/twitter-ads-api) access, then implement analytics endpoints in `lib/ads/providers/x.ts`.

### Microsoft Advertising (Bing) — stub

**Env:** `MICROSOFT_ADS_CLIENT_ID`, `MICROSOFT_ADS_CLIENT_SECRET`, `MICROSOFT_ADS_DEVELOPER_TOKEN`.

Register an Azure AD app with `https://ads.microsoft.com/msads.manage`, then implement Bing Ads Reporting API for daily metrics.

## Operational checklist

1. Run migration `00007_ads_module.sql`
2. Set `TOKEN_ENCRYPTION_KEY` (shared with social)
3. Connect accounts under **Ads → Connections**
4. Generate + approve a media plan → campaigns created as `approved`
5. Link each campaign’s platform ID to pull metrics (or **Seed demo metrics**)
6. Generate creatives → **Creative approvals**
7. Run Inngest (`ads/ingest-daily-metrics` 07:00 UTC, `ads/daily-optimisation` 08:00 UTC)

## Safety

- Money stored as integer pence + currency
- Tokens encrypted with AES-256-GCM
- Creatives require approval before any upload path
- Budget auto-apply only when org enables auto-optimise **and** within `max_daily_budget_change_pence`
