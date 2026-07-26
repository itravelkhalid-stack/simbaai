# Ads write env vars — confirm in Vercel Production

Fail-closed: remote Meta/Google campaign mutations do **nothing** unless these are set correctly.
Also required in-app: an `org_ad_limits` row (see `/ads/settings`) with **Master pause** unchecked for the test.

## Required for any remote ad write

| Variable | Value to enable writes | Notes |
|----------|------------------------|-------|
| `ADS_WRITES_ENABLED` | `true` | Must be the string `true`. Unset/`false` = all remote writes blocked. |
| `ADS_WRITES_META` | `true` (or unset once global is on) | Set `false` to kill Meta only. |
| `ADS_WRITES_GOOGLE` | `true` (or unset once global is on) | Set `false` to kill Google only. |

## Meta writes (campaign create / pause / activate / budget)

| Variable | Required? | Notes |
|----------|-----------|-------|
| `META_APP_ID` | Yes | Same app as social OAuth is fine if Ads scopes granted. |
| `META_APP_SECRET` | Yes | |
| Org Meta ad connection | Yes | Connected in `/ads/connections` with a valid access token. |

## Google Ads writes

| Variable | Required? | Notes |
|----------|-----------|-------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth client |
| `GOOGLE_CLIENT_SECRET` | Yes | |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Yes | API calls throw without this |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | If using MCC | Manager customer id, digits only (no dashes) |
| `GOOGLE_ADS_API_VERSION` | Optional | Defaults to `v25` |
| Org Google ad connection | Yes | Connected in `/ads/connections` |

## In-app gates (not env, but will still block)

- [ ] `/ads/settings` → org limits row exists
- [ ] **Master pause** unchecked (`writes_paused = false`)
- [ ] Meta/Google kill switches unchecked
- [ ] Proposed campaign daily budget ≤ `max_single_campaign_daily_budget_pence` (currently **200p = £2**)
- [ ] Sum of active daily budgets ≤ `max_daily_spend_pence` (currently **500p = £5**)

## Suggested Production values for the first E2E (paused £1/day Google)

```
ADS_WRITES_ENABLED=true
ADS_WRITES_META=true
ADS_WRITES_GOOGLE=true
GOOGLE_ADS_DEVELOPER_TOKEN=<your token>
GOOGLE_ADS_LOGIN_CUSTOMER_ID=<MCC if needed>
GOOGLE_CLIENT_ID=<set>
GOOGLE_CLIENT_SECRET=<set>
META_APP_ID=<set>
META_APP_SECRET=<set>
```

After changing Vercel env: **redeploy**. Then uncheck Master pause on `/ads/settings`.
