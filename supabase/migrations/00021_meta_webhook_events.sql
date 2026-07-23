-- Meta Graph webhook ingest log (org resolution filled in later)

create table public.meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  object_type text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index meta_webhook_events_created_idx
  on public.meta_webhook_events (created_at desc);

create index meta_webhook_events_org_idx
  on public.meta_webhook_events (organization_id)
  where organization_id is not null;

alter table public.meta_webhook_events enable row level security;

-- Ingest via service role only; platform admins may read for debugging
create policy meta_webhook_events_platform_admin_select
  on public.meta_webhook_events
  for select to authenticated
  using (public.is_platform_admin());
