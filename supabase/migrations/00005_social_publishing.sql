-- Social publishing integrations

create type public.social_connection_status as enum (
  'active',
  'expired',
  'revoked',
  'error'
);

alter type public.content_item_status add value if not exists 'publish_failed';

create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  platform public.content_platform not null,
  account_name text not null,
  account_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status public.social_connection_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_connections_org_platform_account unique (organization_id, platform, account_id)
);

create table public.content_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  platform public.content_platform not null,
  platform_post_id text not null,
  captured_at timestamptz not null default now(),
  impressions integer not null default 0,
  reach integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  shares integer not null default 0,
  saves integer not null default 0,
  clicks integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint content_metrics_item_day unique (content_item_id, captured_at)
);

-- Publishing diagnostics on content items
alter table public.content_items
  add column if not exists publish_error text,
  add column if not exists publish_attempts integer not null default 0,
  add column if not exists last_publish_attempt_at timestamptz;

create index social_connections_org_id_idx on public.social_connections (organization_id);
create index social_connections_platform_idx on public.social_connections (platform);
create index social_connections_expires_idx on public.social_connections (token_expires_at);
create index content_metrics_org_id_idx on public.content_metrics (organization_id);
create index content_metrics_item_id_idx on public.content_metrics (content_item_id);
create index content_items_due_publish_idx
  on public.content_items (scheduled_at)
  where status = 'scheduled' and published_at is null;

create trigger social_connections_set_updated_at
  before update on public.social_connections
  for each row execute function public.set_updated_at();

alter table public.social_connections enable row level security;
alter table public.content_metrics enable row level security;

create policy social_connections_select on public.social_connections
  for select to authenticated using (public.is_org_member(organization_id));

create policy social_connections_insert on public.social_connections
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[])
  );

create policy social_connections_update on public.social_connections
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy social_connections_delete on public.social_connections
  for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy content_metrics_select on public.content_metrics
  for select to authenticated using (public.is_org_member(organization_id));

create policy content_metrics_insert on public.content_metrics
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[])
  );

create policy content_metrics_update on public.content_metrics
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy content_metrics_delete on public.content_metrics
  for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));
