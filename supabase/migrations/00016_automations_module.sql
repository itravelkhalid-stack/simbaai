-- Automation engine

create type public.automation_status as enum (
  'draft',
  'active',
  'paused',
  'archived'
);

create type public.automation_run_status as enum (
  'running',
  'success',
  'failed',
  'skipped'
);

create table public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text,
  status public.automation_status not null default 'draft',
  trigger jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  webhook_secret text,
  last_run_at timestamptz,
  run_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  automation_id uuid not null references public.automations (id) on delete cascade,
  status public.automation_run_status not null default 'running',
  trigger_data jsonb not null default '{}'::jsonb,
  actions_executed jsonb not null default '[]'::jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.brand_automation_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade unique,
  auto_publish_channels text[] not null default '{}',
  daily_budget_action_cap_pence integer not null default 50000,
  slack_webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Track automation budget-affecting action spend per brand/day
create table public.automation_budget_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  usage_date date not null,
  used_pence integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, usage_date)
);

create index automations_org_status_idx on public.automations (organization_id, status);
create index automations_brand_idx on public.automations (brand_id);
create index automation_runs_automation_idx on public.automation_runs (automation_id, started_at desc);
create index automation_runs_org_idx on public.automation_runs (organization_id, started_at desc);

create trigger automations_set_updated_at
  before update on public.automations
  for each row execute function public.set_updated_at();
create trigger brand_automation_settings_set_updated_at
  before update on public.brand_automation_settings
  for each row execute function public.set_updated_at();
create trigger automation_budget_usage_set_updated_at
  before update on public.automation_budget_usage
  for each row execute function public.set_updated_at();

alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.brand_automation_settings enable row level security;
alter table public.automation_budget_usage enable row level security;

create policy automations_select on public.automations for select to authenticated
  using (public.is_org_member(organization_id));
create policy automations_write on public.automations for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy automation_runs_select on public.automation_runs for select to authenticated
  using (public.is_org_member(organization_id));
create policy automation_runs_write on public.automation_runs for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy brand_automation_settings_select on public.brand_automation_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy brand_automation_settings_write on public.brand_automation_settings for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy automation_budget_usage_select on public.automation_budget_usage for select to authenticated
  using (public.is_org_member(organization_id));
create policy automation_budget_usage_write on public.automation_budget_usage for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
