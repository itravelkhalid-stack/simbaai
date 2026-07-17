-- Reviews & reporting module

create type public.report_type as enum (
  'daily',
  'weekly',
  'monthly',
  'quarterly'
);

create type public.report_status as enum (
  'scheduled',
  'generating',
  'complete',
  'failed',
  'cancelled'
);

create table public.brand_kpis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  metric_key text not null,
  label text not null,
  target_value numeric not null default 0,
  unit text not null default '',
  channel text,
  is_north_star boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, metric_key)
);

create table public.brand_report_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade unique,
  daily_enabled boolean not null default true,
  daily_hour_utc integer not null default 5,
  weekly_enabled boolean not null default true,
  weekly_weekday integer not null default 1,
  weekly_hour_utc integer not null default 8,
  monthly_enabled boolean not null default true,
  monthly_day integer not null default 1,
  monthly_hour_utc integer not null default 9,
  quarterly_enabled boolean not null default true,
  quarterly_hour_utc integer not null default 10,
  auto_email_enabled boolean not null default false,
  recipients text[] not null default '{}',
  primary_color text not null default '#0f766e',
  secondary_color text not null default '#134e4a',
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  type public.report_type not null,
  title text not null,
  period_start date not null,
  period_end date not null,
  status public.report_status not null default 'scheduled',
  content jsonb not null default '{}'::jsonb,
  pdf_url text,
  sent_to text[] not null default '{}',
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index reports_org_id_idx on public.reports (organization_id);
create index reports_brand_id_idx on public.reports (brand_id);
create index reports_period_idx on public.reports (period_start desc, period_end desc);
create index reports_type_status_idx on public.reports (type, status);
create index brand_kpis_brand_id_idx on public.brand_kpis (brand_id);

create trigger brand_kpis_set_updated_at
  before update on public.brand_kpis
  for each row execute function public.set_updated_at();
create trigger brand_report_settings_set_updated_at
  before update on public.brand_report_settings
  for each row execute function public.set_updated_at();
create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.brand_kpis enable row level security;
alter table public.brand_report_settings enable row level security;
alter table public.reports enable row level security;

create policy brand_kpis_select on public.brand_kpis for select to authenticated
  using (public.is_org_member(organization_id));
create policy brand_kpis_write on public.brand_kpis for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy brand_report_settings_select on public.brand_report_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy brand_report_settings_write on public.brand_report_settings for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy reports_select on public.reports for select to authenticated
  using (public.is_org_member(organization_id));
create policy reports_write on public.reports for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

-- Public bucket; uploads via service role (admin client). Members can read.
insert into storage.buckets (id, name, public)
values ('reports', 'reports', true)
on conflict (id) do nothing;

create policy reports_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'reports');
create policy reports_storage_select_anon on storage.objects for select to anon
  using (bucket_id = 'reports');
