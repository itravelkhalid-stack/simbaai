# Production seed & E2E test (10 steps)

Prerequisites before you start:

1. This deploy is live on Vercel (commit with structured `runClaudeJson` + autonomy fixes).
2. Confirm env checklist: [`docs/ads-writes-env-checklist.md`](./ads-writes-env-checklist.md) — set `ADS_WRITES_*=true` and Google/Meta creds, then **redeploy**.
3. Migrations `00023`–`00026` already applied (verified). Org ad limits row exists at £5/day org / £2/campaign, **Master pause ON** until step 8.

---

### 1. Open the workspace
Log in at your production URL → land on the dashboard for org **simba**.

### 2. Brand kit upload
Go to **Brand → Media library** (`/brand/media`).
Upload a JPEG/PNG logo into the primary logo slot (or “Upload” in the library).
Confirm the asset appears (preview uses a short-lived signed URL — private bucket).

### 3. Optional: guidelines PDF
**Brand → Guidelines** — upload a PDF with tag `guidelines-doc`. Wait for the Inngest job; approve the proposal if one appears.

### 4. Create one content item with an image
**Content →** create a single post (Facebook first).
Write a short caption. Upload an image via the content composer (`content-media` public bucket) **or** attach the brand asset from step 2 (attach mints a 48h signed URL into `media_urls`).
Save.

### 5. Approve & publish to Facebook
Set platform **Facebook**, status → **Approved** (or schedule for now).
Trigger publish (Approve + Publish / wait for `social/publish-due-posts` within ~5 minutes).
Confirm in Meta Page: post exists. In GrowthOS: status `published`, no `publish_error`.

### 6. Publish the same (or a second) item to Instagram
Create or duplicate a post with platform **Instagram**, same image rules (feed image, not Reel).
Approve + publish. Confirm on IG. If it fails, read `publish_error` on the content item (token / aspect ratio / missing image).

### 7. Unpause ad writes in-app
**Ads → Settings** (`/ads/settings`).
Confirm org limits: max daily **£5.00**, max single campaign **£2.00**.
**Uncheck** “Master pause”.
Leave Meta/Google kill switches **unchecked**.
Save.

### 8. Create one paused £1/day Google campaign via media plan
**Ads → Plans** → create/open a media plan → generate or add a Google Search campaign with **£1.00** daily budget.
Use **Create paused on platform** / launch-paused flow (must stay PAUSED).
Confirm:
- GrowthOS campaign `status = paused`
- Google Ads UI shows campaign **Paused**, £1/day
- `platform_campaign_id` populated on the row

### 9. Autonomy for tomorrow’s standup (optional but recommended)
**Brand → Autonomy**: leave mode **Approval** for now (standup generation does not need autonomous outbound).
Ensure **Agent activity paused** is **off**.

### 10. Confirm 06:05 UTC standup tomorrow
Default schedule: daily standup at **07:00 Europe/London** → picked up by `meetings/hourly-scheduler` at **xx:05** UTC.
In BST that is **06:05 UTC**.

Next morning:
- Open **Meetings** — look for a new `daily_standup` with status **complete** (not `failed`).
- Open minutes — must have real `title`, yesterday/today sections, and valid markdown (structured tool output).
- If it failed, check `agent_runs` / meeting `error` for Zod vs schema issues (should be fixed).

Manual shortcut anytime: **Meetings → Run meeting → Daily standup** to validate generation without waiting for the cron.
