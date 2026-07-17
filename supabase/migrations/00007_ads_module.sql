-- Paid ads module (Meta, TikTok, Google, X, Bing)

create type public.ad_platform as enum (
  'meta',
  'tiktok',
  'google',
  'x',
  'bing'
);

create type public.ad_connection_status as enum (
  'active',
  'expired',
  'revoked',
  'error',
  'pending'
);

create type public.ad_campaign_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'active',
  'paused',
  'completed',
  'archived',
  'error'
);

create type public.ad_creative_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'live',
  'paused',
  'archived'
);

create type public.ad_media_plan_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'archived'
);

create type public.ad_recommendation_status as enum (
  'pending',
  'applied',
  'dismissed',
  'failed'
);

create type public.ad_recommendation_type as enum (
  'pause_campaign',
  'activate_campaign',
  'shift_budget',
  'refresh_creative',
  'adjust_targeting',
  'other'
);

create table public.ad_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  platform public.ad_platform not null,
  account_id text not null,
  account_name text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status public.ad_connection_status not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_connections_org_platform_account unique (organization_id, platform, account_id)
);

create table public.ad_media_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  goal_brief text not null,
  monthly_budget_pence integer not null,
  currency text not null default 'GBP',
  target_roas numeric(10, 2),
  objective text,
  plan jsonb not null default '{}'::jsonb,
  status public.ad_media_plan_status not null default 'draft',
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  connection_id uuid references public.ad_connections (id) on delete set null,
  media_plan_id uuid references public.ad_media_plans (id) on delete set null,
  platform public.ad_platform not null,
  platform_campaign_id text,
  name text not null,
  objective text,
  status public.ad_campaign_status not null default 'draft',
  daily_budget_pence integer,
  lifetime_budget_pence integer,
  currency text not null default 'GBP',
  start_date date,
  end_date date,
  targeting jsonb not null default '{}'::jsonb,
  funnel_stage text,
  target_roas numeric(10, 2),
  is_managed boolean not null default true,
  last_sync_at timestamptz,
  last_error text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ad_creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  format text not null default 'single_image',
  headline text,
  primary_text text,
  description text,
  cta text,
  hook text,
  media_urls text[] not null default '{}',
  status public.ad_creative_status not null default 'draft',
  platform_creative_id text,
  rejection_reason text,
  variant_label text,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ad_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  metric_date date not null,
  spend_pence integer not null default 0,
  impressions integer not null default 0,
  clicks integer not null default 0,
  conversions numeric(12, 4) not null default 0,
  revenue_pence integer not null default 0,
  cpm numeric(12, 4) not null default 0,
  cpc_pence integer not null default 0,
  ctr numeric(12, 6) not null default 0,
  roas numeric(12, 4) not null default 0,
  currency text not null default 'GBP',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint ad_metrics_daily_campaign_date unique (campaign_id, metric_date)
);

create table public.ad_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  campaign_id uuid references public.ad_campaigns (id) on delete set null,
  recommendation_type public.ad_recommendation_type not null default 'other',
  title text not null,
  rationale text not null,
  payload jsonb not null default '{}'::jsonb,
  status public.ad_recommendation_status not null default 'pending',
  dismiss_reason text,
  applied_at timestamptz,
  dismissed_at timestamptz,
  applied_by uuid references auth.users (id) on delete set null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_connections_org_id_idx on public.ad_connections (organization_id);
create index ad_connections_platform_idx on public.ad_connections (platform);
create index ad_media_plans_org_id_idx on public.ad_media_plans (organization_id);
create index ad_campaigns_org_id_idx on public.ad_campaigns (organization_id);
create index ad_campaigns_platform_idx on public.ad_campaigns (platform);
create index ad_campaigns_status_idx on public.ad_campaigns (status);
create index ad_creatives_org_id_idx on public.ad_creatives (organization_id);
create index ad_creatives_campaign_id_idx on public.ad_creatives (campaign_id);
create index ad_creatives_status_idx on public.ad_creatives (status);
create index ad_metrics_daily_org_id_idx on public.ad_metrics_daily (organization_id);
create index ad_metrics_daily_date_idx on public.ad_metrics_daily (metric_date);
create index ad_metrics_daily_campaign_id_idx on public.ad_metrics_daily (campaign_id);
create index ad_recommendations_org_id_idx on public.ad_recommendations (organization_id);
create index ad_recommendations_status_idx on public.ad_recommendations (status);

create trigger ad_connections_set_updated_at
  before update on public.ad_connections
  for each row execute function public.set_updated_at();
create trigger ad_media_plans_set_updated_at
  before update on public.ad_media_plans
  for each row execute function public.set_updated_at();
create trigger ad_campaigns_set_updated_at
  before update on public.ad_campaigns
  for each row execute function public.set_updated_at();
create trigger ad_creatives_set_updated_at
  before update on public.ad_creatives
  for each row execute function public.set_updated_at();
create trigger ad_recommendations_set_updated_at
  before update on public.ad_recommendations
  for each row execute function public.set_updated_at();

alter table public.ad_connections enable row level security;
alter table public.ad_media_plans enable row level security;
alter table public.ad_campaigns enable row level security;
alter table public.ad_creatives enable row level security;
alter table public.ad_metrics_daily enable row level security;
alter table public.ad_recommendations enable row level security;

create policy ad_connections_select on public.ad_connections for select to authenticated
  using (public.is_org_member(organization_id));
create policy ad_connections_write on public.ad_connections for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy ad_media_plans_select on public.ad_media_plans for select to authenticated
  using (public.is_org_member(organization_id));
create policy ad_media_plans_write on public.ad_media_plans for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy ad_campaigns_select on public.ad_campaigns for select to authenticated
  using (public.is_org_member(organization_id));
create policy ad_campaigns_write on public.ad_campaigns for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy ad_creatives_select on public.ad_creatives for select to authenticated
  using (public.is_org_member(organization_id));
create policy ad_creatives_write on public.ad_creatives for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy ad_metrics_daily_select on public.ad_metrics_daily for select to authenticated
  using (public.is_org_member(organization_id));
create policy ad_metrics_daily_write on public.ad_metrics_daily for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy ad_recommendations_select on public.ad_recommendations for select to authenticated
  using (public.is_org_member(organization_id));
create policy ad_recommendations_write on public.ad_recommendations for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
