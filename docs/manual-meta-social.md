# Manual test: Meta Facebook + Instagram hardening

Prerequisites:

- `META_APP_ID` / `META_APP_SECRET` set in `.env.local`
- Migration `00020_meta_hardening.sql` applied (`npx tsx scripts/apply-migrations.ts`)
- Dev server running; Inngest connected if you rely on scheduled publish/metrics jobs
- A Meta user who manages at least one Facebook Page with a linked Instagram Business account
- App in Meta Developer has Pages + Instagram permissions approved (or app in Dev mode with your user as tester)

## 1. Connect → pick Page

1. Open `/social` as org_owner or org_admin.
2. Click **Connect** on **Facebook**.
3. Complete Meta OAuth.
4. You should land on `/social/meta/select` listing Pages (and IG handles when linked).
5. Click **Use this Page**.
6. Confirm `/social` shows the connection with Page ID (and IG if present), status `active`, and a token end date when Meta returned `expires_in`.
7. Repeat for **Instagram** (or use Reconnect / change Page). Only Pages with a linked IG account should be selectable.

## 2. Publish text post to Facebook

1. Create/generate a **Facebook** content item (text only is fine).
2. Approve it and schedule for ~1 minute from now (or use calendar **Publish now** / retry if available).
3. Wait for the publish job (`social/publish-due-posts` cron or `social/publish.requested`).
4. Open the content item: status **published**, `platform_post_id` set (Graph post id), no `publish_error`.
5. Confirm the post appears on the selected Facebook Page.

## 3. Publish image post to Instagram

1. Create/generate an **Instagram** content item.
2. On the item page, **Upload image** under Media (JPEG/PNG/WebP/GIF ≤ 8MB). Confirm a public `content-media` URL is listed.
3. Try scheduling **without** media on a fresh IG item: you should get a clear validation error.
4. With media present, schedule/approve so it publishes.
5. Confirm status **published**, `platform_post_id` set (IG media id), and the post appears on Instagram.

## 4. Verify `platform_post_id` stored

In Supabase SQL or Table Editor:

```sql
select id, platform, status, platform_post_id, media_urls, publish_error
from content_items
where platform in ('facebook', 'instagram')
order by published_at desc nulls last
limit 10;
```

Both test posts should have non-null `platform_post_id`.

## 5. Metrics next run

1. Wait for `social/ingest-daily-metrics` (cron `0 6 * * *`) or trigger your local Inngest function for metrics ingest.
2. Check:

```sql
select *
from content_metrics
where platform_post_id in (
  select platform_post_id from content_items
  where platform in ('facebook', 'instagram')
  and platform_post_id is not null
  order by published_at desc
  limit 5
)
order by captured_at desc;
```

Expect insight rows (impressions/reach/etc. may be zero shortly after publish; the important check is that the job runs without auth errors).

## Token / reconnect checks (optional)

1. On `/social`, if `token_expires_at` is within 7 days, badge **reconnect needed (expires within 7 days)** appears.
2. Use **Reconnect / change Page** to pick a different Page; prior active connection for that platform should be revoked.
3. Force a bad token (disconnect in Meta Business or revoke app): next publish should mark connection `expired`, set `publish_error`, and create an in-app notification for org admins (category blockers) — not a silent failure.

## Notes

- Instagram Graph requires a **public HTTPS** image URL; local-only URLs will fail.
- Facebook text-only posts do not need media.
- Page access token is stored encrypted; long-lived user token is kept encrypted in `metadata.user_access_token_encrypted` for support/diagnostics.
