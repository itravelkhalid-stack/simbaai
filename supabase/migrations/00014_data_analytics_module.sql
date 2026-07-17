-- Data & analytics module

create type public.analytics_channel as enum (
  'meta',
  'tiktok',
  'google',
  'x',
  'bing',
  'email',
  'seo',
  'content',
  'social',
  'web',
  'crm',
  'other',
  'all'
);

create table public.analytics_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  metric_date date not null,
  channel public.analytics_channel not null,
  impressions bigint not null default 0,
  engagements bigint not null default 0,
  clicks bigint not null default 0,
  sessions bigint not null default 0,
  leads bigint not null default 0,
  sales bigint not null default 0,
  revenue_pence bigint not null default 0,
  spend_pence bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, metric_date, channel)
);

create table public.ga4_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade unique,
  property_id text not null,
  property_name text,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  status text not null default 'active',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.analytics_ga4_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  metric_date date not null,
  source text not null default '(direct)',
  medium text not null default '(none)',
  sessions integer not null default 0,
  conversions numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (brand_id, metric_date, source, medium)
);

create table public.analytics_anomalies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  metric_date date not null,
  channel public.analytics_channel not null default 'all',
  metric_key text not null,
  severity text not null default 'warning',
  title text not null,
  detail text not null,
  current_value numeric,
  baseline_value numeric,
  delta_pct numeric,
  ai_context text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.analytics_chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  query_plan jsonb,
  chart jsonb,
  created_at timestamptz not null default now()
);

create index analytics_daily_org_date_idx on public.analytics_daily (organization_id, metric_date desc);
create index analytics_daily_brand_date_idx on public.analytics_daily (brand_id, metric_date desc);
create index analytics_ga4_daily_brand_date_idx on public.analytics_ga4_daily (brand_id, metric_date desc);
create index analytics_anomalies_org_idx on public.analytics_anomalies (organization_id, created_at desc);
create index analytics_chat_org_idx on public.analytics_chat_messages (organization_id, created_at desc);

create trigger analytics_daily_set_updated_at
  before update on public.analytics_daily
  for each row execute function public.set_updated_at();
create trigger ga4_connections_set_updated_at
  before update on public.ga4_connections
  for each row execute function public.set_updated_at();

alter table public.analytics_daily enable row level security;
alter table public.ga4_connections enable row level security;
alter table public.analytics_ga4_daily enable row level security;
alter table public.analytics_anomalies enable row level security;
alter table public.analytics_chat_messages enable row level security;

create policy analytics_daily_select on public.analytics_daily for select to authenticated
  using (public.is_org_member(organization_id));
create policy analytics_daily_write on public.analytics_daily for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy ga4_connections_select on public.ga4_connections for select to authenticated
  using (public.is_org_member(organization_id));
create policy ga4_connections_write on public.ga4_connections for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy analytics_ga4_select on public.analytics_ga4_daily for select to authenticated
  using (public.is_org_member(organization_id));
create policy analytics_ga4_write on public.analytics_ga4_daily for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy analytics_anomalies_select on public.analytics_anomalies for select to authenticated
  using (public.is_org_member(organization_id));
create policy analytics_anomalies_write on public.analytics_anomalies for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy analytics_chat_select on public.analytics_chat_messages for select to authenticated
  using (public.is_org_member(organization_id));
create policy analytics_chat_insert on public.analytics_chat_messages for insert to authenticated
  with check (public.is_org_member(organization_id));
