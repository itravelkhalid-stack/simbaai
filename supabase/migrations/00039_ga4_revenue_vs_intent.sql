-- Split GA4 revenue conversions from intent/proxy engagement events.

alter table public.ga4_connections
  add column if not exists intent_event_names text[] not null default '{}'::text[];

comment on column public.ga4_connections.conversion_event_names is
  'GA4 event names that count as revenue conversions (purchase/booking). Empty = auto purchase-like if present, else none.';

comment on column public.ga4_connections.intent_event_names is
  'GA4 event names that count as engagement/intent proxies only — never used for ROAS/CPA/revenue attribution.';

alter table public.analytics_ga4_daily
  add column if not exists intent_events integer not null default 0;

comment on column public.analytics_ga4_daily.conversions is
  'Count of revenue conversion events only (purchase/booking).';

comment on column public.analytics_ga4_daily.intent_events is
  'Count of engagement/intent proxy events (e.g. form_start). Not revenue.';

-- Move misclassified non-purchase events from conversion_event_names → intent_event_names.
with purchase as (
  select unnest(array[
    'purchase',
    'ecommerce_purchase',
    'purchase_ecommerce',
    'in_app_purchase',
    'booking',
    'book',
    'booked',
    'reservation',
    'reserve',
    'order_complete',
    'order_completed',
    'checkout_completed',
    'payment_complete',
    'payment_completed'
  ]::text[]) as name
),
classified as (
  select
    c.id,
    coalesce(
      (
        select array_agg(distinct e order by e)
        from unnest(c.conversion_event_names) e
        where lower(e) in (select name from purchase)
      ),
      '{}'::text[]
    ) as revenue_events,
    coalesce(
      (
        select array_agg(distinct e order by e)
        from unnest(c.conversion_event_names) e
        where lower(e) not in (select name from purchase)
      ),
      '{}'::text[]
    ) as proxy_events
  from public.ga4_connections c
  where cardinality(c.conversion_event_names) > 0
)
update public.ga4_connections g
set
  conversion_event_names = classified.revenue_events,
  intent_event_names = (
    select coalesce(array_agg(distinct e order by e), '{}'::text[])
    from unnest(
      coalesce(g.intent_event_names, '{}'::text[]) || classified.proxy_events
    ) e
  )
from classified
where g.id = classified.id
  and cardinality(classified.proxy_events) > 0;
