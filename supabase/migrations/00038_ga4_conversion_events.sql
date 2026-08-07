-- Per-brand GA4 conversion event selection (avoid summing all key events).

alter table public.ga4_connections
  add column if not exists conversion_event_names text[] not null default '{}'::text[];

alter table public.ga4_connections
  add column if not exists discovered_event_names text[] not null default '{}'::text[];

comment on column public.ga4_connections.conversion_event_names is
  'GA4 event names that count as true conversions for this brand. Empty = auto (purchase-like if present, else none).';

comment on column public.ga4_connections.discovered_event_names is
  'Event names seen on the last sync (for settings UI). Key-event flags are often inflated in GA4.';
