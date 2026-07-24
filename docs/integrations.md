# Social publishing integrations

GrowthOS publishes approved, scheduled `content_items` through provider modules in `/lib/social/providers`. Access tokens are encrypted at rest with AES-256-GCM (`/lib/crypto.ts`) using `TOKEN_ENCRYPTION_KEY`.

Background jobs use **Inngest** (same role as Trigger.dev in the stack rules):

| Job | Schedule | Purpose |
|---|---|---|
| `social/publish-due-posts` | every 5 minutes | Publish due `scheduled` items |
| `social/ingest-daily-metrics` | daily 06:00 UTC | Pull per-post metrics into `content_metrics` |
| `social/publish-post-now` | event | Manual retry from the UI |

OAuth connect UI: **Settings → Connections** (`/settings/connections`).

Redirect URI pattern for every app:

```text
https://YOUR_DOMAIN/api/social/oauth/{platform}/callback
```

Local example:

```text
http://localhost:3000/api/social/oauth/facebook/callback
# Instagram uses the same Meta OAuth + Page picker (no separate Instagram OAuth)
http://localhost:3000/api/social/oauth/x/callback
http://localhost:3000/api/social/oauth/linkedin/callback
http://localhost:3000/api/social/oauth/tiktok/callback
http://localhost:3000/api/social/oauth/pinterest/callback
http://localhost:3000/api/social/oauth/youtube/callback
```

Shared env:

```bash
TOKEN_ENCRYPTION_KEY=   # 32-byte key, base64-encoded
OAUTH_STATE_SECRET=     # optional; falls back to TOKEN_ENCRYPTION_KEY
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
```

Generate a key:

```bash
openssl rand -base64 32
```

---

## Meta (Facebook Pages + Instagram Business)

**Env:** `META_APP_ID`, `META_APP_SECRET`

1. Create an app at [Meta for Developers](https://developers.facebook.com/).
2. Add products: **Facebook Login**, **Instagram**.
3. Use a Business-type app. Create / link a Facebook Page and an Instagram Professional account connected to that Page.
4. Request permissions (App Review required for live mode):
   - Facebook: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `business_management`
   - Instagram: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, plus page permissions above
5. Add Valid OAuth Redirect URIs for both `facebook` and `instagram` callback paths.
6. For Instagram publishing, media URLs must be publicly reachable HTTPS endpoints.

**App review notes:** Meta requires screencasts of the connect + publish flow, privacy policy URL, and a real Business verification for advanced access.

---

## X API v2

**Env:** `X_CLIENT_ID`, `X_CLIENT_SECRET` (confidential client)

1. Apply at [X Developer Portal](https://developer.x.com/).
2. Create a Project + App with OAuth 2.0.
3. Enable **Read and Write** and request elevated access if needed for posting.
4. Scopes used: `tweet.read tweet.write users.read offline.access`.
5. PKCE is required; GrowthOS stores the verifier in the signed OAuth `state`.
6. Callback URL must exactly match the GrowthOS callback.

**App review notes:** X often requires a use-case description explaining automated brand publishing on behalf of connected customers (multi-tenant).

---

## LinkedIn (Organisation pages)

**Env:** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

1. Create an app at [LinkedIn Developer Portal](https://www.linkedin.com/developers/).
2. Request products: **Share on LinkedIn**, **Marketing Developer Platform** / Community Management (as available in your region).
3. Default scopes (company Page): `openid profile w_member_social rw_organization_admin w_organization_social r_organization_social`.
   Personal-only mode: set `LINKEDIN_MEMBER_MODE=true` (drops org scopes).
4. The connecting user must be an admin of the Company Page.
5. Add the OAuth 2.0 redirect URL in Auth settings.

**App review notes:** Organisation posting usually requires Marketing Developer Platform access and a review of how you store tokens + act on behalf of pages.

---

## TikTok Content Posting API

**Env:** `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`

1. Register at [TikTok for Developers](https://developers.tiktok.com/).
2. Create a Login Kit + Content Posting API app.
3. Scopes used: `user.info.basic`, `video.publish`, `video.upload`.
4. Add redirect domains / URLs for local and production.
5. Content Posting often starts in **inbox / draft** mode until your app is audited for direct post.

**App review notes:** TikTok audit requires privacy policy, terms, demo video, and justification for publishing on creators’ behalf. Direct publish may remain restricted until approval.

---

## Pinterest

**Env:** `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`

1. Create an app at [Pinterest Developers](https://developers.pinterest.com/).
2. Request scopes: `boards:read`, `pins:read`, `pins:write`, `user_accounts:read`.
3. Add redirect URI.
4. Trial apps can write to the owning account; production needs standard access review.
5. GrowthOS stores the first board id as `metadata.default_board_id` for pin creation. Pins require a public image URL.

---

## YouTube (Google Data API)

**Env:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

1. Create a Google Cloud project + OAuth consent screen.
2. Enable **YouTube Data API v3** (and YouTube Analytics API if you expand metrics).
3. Create OAuth Web credentials; add authorized redirect URI for `/api/social/oauth/youtube/callback`.
4. Scopes used: `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`.
5. Publishing shorts/videos requires a resumable upload session. GrowthOS stores the OAuth connection and metrics path now; wire a media upload worker before enabling automatic YouTube publishes (or set `metadata.youtube_video_id` after manual upload).

**App review notes:** Google verification is required for sensitive scopes in production. Submit privacy policy, domain ownership, and demo video.

---

## Operational checklist

1. Run migration `00005_social_publishing.sql`.
2. Set `TOKEN_ENCRYPTION_KEY` and provider credentials in `.env.local` / Vercel.
3. Run `npm run dev` and `npm run inngest:dev`.
4. Connect accounts in **Settings → Connections**.
5. Approve + schedule a content item with a public `media_urls` entry when the platform requires media.
6. Confirm the calendar shows human-readable `publish_error` text on failures, and **Retry publish** on the item page.

### Security

- Never store raw access tokens in the database.
- Only `org_owner` / `org_admin` can connect or disconnect.
- Tokens are encrypted with a server-only key; rotate by reconnecting accounts after changing `TOKEN_ENCRYPTION_KEY` (old ciphertext will not decrypt).

---

# Email marketing (Resend)

GrowthOS sends campaigns through Resend with per-org verified domains (`email_sending_domains`). Batch sending, open/click webhooks, and GDPR unsubscribe/suppression live under `/email`.

## Endpoints

| Path | Purpose |
|------|---------|
| `POST /api/email/webhooks/resend` | Ingest delivered/opened/clicked/bounced/complained → `email_events` + campaign stats |
| `GET /api/email/unsubscribe?token=…` | Public one-click unsubscribe (signed token) |

## Inngest

| Function | Trigger | Behavior |
|----------|---------|----------|
| `email/campaign.send` | event | Batch-send a campaign with rate limiting |
| `email/send-due-campaigns` | cron | Pick up `scheduled` campaigns whose time has passed |

## Setup

1. Run migration `00006_email_module.sql`.
2. Set `RESEND_API_KEY`, `EMAIL_UNSUBSCRIBE_SECRET`, and `NEXT_PUBLIC_SITE_URL`.
3. In Resend, point the webhook to `{SITE_URL}/api/email/webhooks/resend`.
4. Add a sending domain under **Email → Sending domains**, publish DNS records, then **Refresh verification**.
5. Set a physical address (injected into every campaign footer with the unsubscribe link).
