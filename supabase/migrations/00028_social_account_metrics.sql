-- Daily follower snapshots per connected social account (for brand KPI targets)

create table public.social_account_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  connection_id uuid references public.social_connections (id) on delete set null,
  platform public.content_platform not null,
  account_id text not null,
  metric_date date not null,
  followers integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, brand_id, platform, account_id, metric_date)
);

create index social_account_metrics_daily_org_idx
  on public.social_account_metrics_daily (organization_id);
create index social_account_metrics_daily_brand_date_idx
  on public.social_account_metrics_daily (brand_id, metric_date);
create index social_account_metrics_daily_platform_idx
  on public.social_account_metrics_daily (organization_id, brand_id, platform, metric_date);

alter table public.social_account_metrics_daily enable row level security;

create policy social_account_metrics_daily_select
  on public.social_account_metrics_daily
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy social_account_metrics_daily_write
  on public.social_account_metrics_daily
  for all to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

comment on table public.social_account_metrics_daily is
  'Daily follower counts for connected social accounts; used by ig_followers / fb_followers brand KPIs.';
