# Brand media storage access

## Model

`brand-media` is a **private** Supabase Storage bucket.

| Who | How |
|-----|-----|
| Org members (dashboard) | Authenticated SELECT/INSERT/UPDATE/DELETE where the object path starts with their `organization_id` |
| Anonymous / Meta / Google | **No** blanket public read |
| Instagram / Facebook publish | Service role mints a **long-lived signed URL** (48h) at publish time and passes that to Graph |
| PDF ingest / server jobs | Service role `download()` by `storage_path` |

Path layout: `{organization_id}/{brand_id}/{timestamp}-{filename}`

## Browser → Storage uploads (required)

Image/video (and brand-slot) uploads **must not** pass through Next.js Server Actions. The default Server Actions body limit is 1MB (`digest 345093329`).

Flow:

1. Browser validates type/size (images & videos ≤ 25MB).
2. Browser uploads bytes with the user JWT to `brand-media` under `{orgId}/{brandId}/…` (Storage RLS).
3. Server action `registerUploadedMediaAsset` receives **only** path + metadata, inserts `media_assets`, and queues vision tagging / guidelines PDF jobs.

See `lib/media/client-upload.ts` and `components/media/direct-media-upload.tsx`.

## Why not a public bucket?

Migration `00023` originally allowed `authenticated` + `anon` SELECT on the entire bucket. Any logged-in user (or unauthenticated client with the anon key) could list/read every org’s assets. That breaks multi-tenant isolation.

## Why signed URLs for IG instead of a “publishable” public prefix?

Meta’s Graph API must HTTP-fetch `image_url` without our auth cookies. Options considered:

1. Public prefix per org for assets flagged publishable — still a standing public surface and more policy surface area.
2. **Signed URLs at publish time** (chosen) — bucket stays private; only the specific object Meta needs is temporarily reachable; URL expires after the publish window.

`lib/media/storage.ts`:

- `createBrandMediaSignedUrl(path, expiresIn)` — short-lived for UI
- `mintPublishableBrandMediaUrl(path)` — 48h signed URL for Graph publish

`media_assets.public_url` stores a stable path-style URL for reference; UI and publish paths resolve signed URLs from `storage_path`.

## Content-media note

`content-media` (migration `00020`) remains a public bucket used by the content composer. Prefer uploading publish images there, or attaching brand assets so publish mints signed URLs into `content_items.media_urls`.
