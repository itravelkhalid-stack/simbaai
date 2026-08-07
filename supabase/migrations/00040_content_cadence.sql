-- Per-brand organic content cadence (daily quotas by platform/format bucket).

alter table public.brands
  add column if not exists content_cadence jsonb not null default '{}'::jsonb;

comment on column public.brands.content_cadence is
  'Organic cadence quotas. Shape: { instagram?: { feed_per_day, stories_per_day }, facebook?: { feed_per_day }, linkedin?: { feed_per_day } }. Empty keys use platform defaults.';
