# Deferred defects (not in this pass)

From the Phases A–E production audit. Do **not** batch these into the blocker-list fix pass.

## Instagram / Meta Graph

- [ ] **Reels / video publish** — currently hard-rejects `VIDEO_FORMATS` in `lib/social/providers/instagram.ts`
- [ ] **Error code 613** (rate limit variant) — not handled in `lib/social/instagram-errors.ts` (4 / 17 / 32 are)
- [ ] **Capture `fbtrace_id`** from Graph error envelopes into `publish_error` / logs for Meta support

## Related follow-ups (optional)

- [ ] Distinguish permanent vs retryable IG errors so aspect-ratio failures do not burn all 5 attempts
- [ ] Scheduled backoff for rate-limited publishes (today: wait for next `*/5` cron only)
- [ ] Org-scope `content-media` bucket policies the same way as `brand-media` (still public from `00020`)
- [ ] AI media tagging (`media_assets.source = 'ai'`) — schema only, no writer
