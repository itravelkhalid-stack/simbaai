-- Phase C: real Meta + Google Ads writes with hard spend limits and launch approval

alter table public.ad_campaigns
  add column platform_adset_id text,
  add column platform_ad_id text,
  add column platform_budget_id text,
  add column platform_metadata jsonb not null default '{}'::jsonb,
  add column remote_created_at timestamptz,
  add column launch_approved_by uuid references auth.users (id) on delete set null,
  add column launch_approved_at timestamptz;

create table public.org_ad_limits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete cascade,
  max_daily_spend_pence integer not null check (max_daily_spend_pence >= 0),
  max_single_campaign_daily_budget_pence integer not null
    check (max_single_campaign_daily_budget_pence >= 0),
  writes_paused boolean not null default true,
  platform_kill_switches jsonb not null default
    '{"meta":false,"google":false,"tiktok":true,"x":true,"bing":true}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One organization-wide row and at most one override per brand.
create unique index org_ad_limits_org_global_unique
  on public.org_ad_limits (organization_id)
  where brand_id is null;
create unique index org_ad_limits_org_brand_unique
  on public.org_ad_limits (organization_id, brand_id)
  where brand_id is not null;
create index org_ad_limits_org_idx on public.org_ad_limits (organization_id);
create index org_ad_limits_brand_idx on public.org_ad_limits (brand_id);

create trigger org_ad_limits_set_updated_at
  before update on public.org_ad_limits
  for each row execute function public.set_updated_at();

alter table public.org_ad_limits enable row level security;

create policy org_ad_limits_select on public.org_ad_limits
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy org_ad_limits_write on public.org_ad_limits
  for all to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner','org_admin']::public.org_member_role[]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner','org_admin']::public.org_member_role[]
    )
  );

comment on table public.org_ad_limits is
  'Fail-closed spend limits and kill switches checked before every remote Ads write.';
comment on column public.org_ad_limits.writes_paused is
  'Organization/brand master kill switch. New rows default paused.';
comment on column public.org_ad_limits.platform_kill_switches is
  'Per-platform kill switches; true means all remote writes for that platform are blocked.';
