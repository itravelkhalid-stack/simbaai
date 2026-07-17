-- Finance module (client marketing finance + platform billing)

create type public.finance_channel as enum (
  'meta',
  'tiktok',
  'google',
  'x',
  'bing',
  'email',
  'seo',
  'content',
  'social',
  'other',
  'platform'
);

create type public.expense_source as enum (
  'auto_ads',
  'auto_platform',
  'manual'
);

create type public.revenue_source as enum (
  'shopify',
  'woo',
  'manual',
  'crm'
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  channel public.finance_channel not null,
  planned_pence integer not null default 0,
  currency text not null default 'GBP',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_period check (period_end >= period_start),
  unique (brand_id, period_start, period_end, channel)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  expense_date date not null,
  channel public.finance_channel not null,
  description text not null,
  amount_pence integer not null default 0,
  currency text not null default 'GBP',
  source public.expense_source not null default 'manual',
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, source, reference)
);

create table public.revenue_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  revenue_date date not null,
  source public.revenue_source not null,
  amount_pence integer not null default 0,
  currency text not null default 'GBP',
  orders_count integer not null default 0,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, source, reference)
);

create table public.brand_finance_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade unique,
  cogs_pct numeric not null default 0,
  currency text not null default 'GBP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.finance_weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  week_start date not null,
  summary_markdown text not null,
  alerts jsonb not null default '[]'::jsonb,
  reallocation_suggestions jsonb not null default '[]'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (brand_id, week_start)
);

-- Platform billing fields on organizations
alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_price_id text,
  add column if not exists billing_email text,
  add column if not exists plan_period_start timestamptz,
  add column if not exists plan_period_end timestamptz;

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stripe_event_id text unique,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index budgets_org_brand_idx on public.budgets (organization_id, brand_id);
create index expenses_org_date_idx on public.expenses (organization_id, expense_date desc);
create index expenses_brand_channel_idx on public.expenses (brand_id, channel);
create index revenue_records_org_date_idx on public.revenue_records (organization_id, revenue_date desc);
create index billing_events_org_idx on public.billing_events (organization_id);

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();
create trigger revenue_records_set_updated_at
  before update on public.revenue_records
  for each row execute function public.set_updated_at();
create trigger brand_finance_settings_set_updated_at
  before update on public.brand_finance_settings
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.revenue_records enable row level security;
alter table public.brand_finance_settings enable row level security;
alter table public.finance_weekly_summaries enable row level security;
alter table public.billing_events enable row level security;

create policy budgets_select on public.budgets for select to authenticated
  using (public.is_org_member(organization_id));
create policy budgets_write on public.budgets for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy expenses_select on public.expenses for select to authenticated
  using (public.is_org_member(organization_id));
create policy expenses_write on public.expenses for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy revenue_records_select on public.revenue_records for select to authenticated
  using (public.is_org_member(organization_id));
create policy revenue_records_write on public.revenue_records for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy brand_finance_settings_select on public.brand_finance_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy brand_finance_settings_write on public.brand_finance_settings for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy finance_weekly_select on public.finance_weekly_summaries for select to authenticated
  using (public.is_org_member(organization_id));
create policy finance_weekly_write on public.finance_weekly_summaries for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy billing_events_select on public.billing_events for select to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));
