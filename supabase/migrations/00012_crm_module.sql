-- CRM module

create type public.crm_lifecycle_stage as enum (
  'subscriber',
  'lead',
  'mql',
  'sql',
  'customer',
  'repeat',
  'churned'
);

create type public.crm_activity_type as enum (
  'note',
  'email',
  'call',
  'meeting',
  'task',
  'status_change'
);

create table public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  stages jsonb not null default '[]'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  email text not null,
  name text,
  phone text,
  company text,
  source text,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}'::jsonb,
  lifecycle_stage public.crm_lifecycle_stage not null default 'subscriber',
  owner_id uuid references auth.users (id) on delete set null,
  total_revenue_pence integer not null default 0,
  lead_score integer,
  lead_score_reasoning text,
  lead_scored_at timestamptz,
  email_subscriber_id uuid references public.email_subscribers (id) on delete set null,
  last_activity_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_contacts_email_lower check (email = lower(email)),
  unique (brand_id, email)
);

create table public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  contact_id uuid not null references public.crm_contacts (id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines (id) on delete cascade,
  name text not null,
  value_pence integer not null default 0,
  stage text not null,
  expected_close date,
  won_at timestamptz,
  lost_at timestamptz,
  lost_reason text,
  sort_order integer not null default 0,
  stalled_since timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  contact_id uuid not null references public.crm_contacts (id) on delete cascade,
  deal_id uuid references public.crm_deals (id) on delete set null,
  type public.crm_activity_type not null,
  content text not null,
  user_id uuid references auth.users (id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.crm_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  contact_id uuid not null references public.crm_contacts (id) on delete cascade,
  provider text not null check (provider in ('shopify', 'woocommerce', 'manual', 'form')),
  external_id text not null,
  order_total_pence integer not null default 0,
  currency text not null default 'GBP',
  ordered_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (brand_id, provider, external_id)
);

create table public.crm_form_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  contact_id uuid references public.crm_contacts (id) on delete set null,
  form_name text not null default 'website',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.crm_pipeline_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  week_start date not null,
  summary_markdown text not null,
  stalled_deal_ids uuid[] not null default '{}',
  next_actions jsonb not null default '[]'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (brand_id, week_start)
);

create index crm_contacts_org_id_idx on public.crm_contacts (organization_id);
create index crm_contacts_brand_id_idx on public.crm_contacts (brand_id);
create index crm_contacts_lifecycle_idx on public.crm_contacts (lifecycle_stage);
create index crm_contacts_tags_idx on public.crm_contacts using gin (tags);
create index crm_deals_pipeline_stage_idx on public.crm_deals (pipeline_id, stage);
create index crm_deals_contact_id_idx on public.crm_deals (contact_id);
create index crm_activities_contact_id_idx on public.crm_activities (contact_id, created_at desc);
create index crm_orders_contact_id_idx on public.crm_orders (contact_id);

create trigger crm_pipelines_set_updated_at
  before update on public.crm_pipelines
  for each row execute function public.set_updated_at();
create trigger crm_contacts_set_updated_at
  before update on public.crm_contacts
  for each row execute function public.set_updated_at();
create trigger crm_deals_set_updated_at
  before update on public.crm_deals
  for each row execute function public.set_updated_at();

alter table public.crm_pipelines enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_deals enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_orders enable row level security;
alter table public.crm_form_submissions enable row level security;
alter table public.crm_pipeline_reviews enable row level security;

create policy crm_pipelines_select on public.crm_pipelines for select to authenticated
  using (public.is_org_member(organization_id));
create policy crm_pipelines_write on public.crm_pipelines for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy crm_contacts_select on public.crm_contacts for select to authenticated
  using (public.is_org_member(organization_id));
create policy crm_contacts_write on public.crm_contacts for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy crm_deals_select on public.crm_deals for select to authenticated
  using (public.is_org_member(organization_id));
create policy crm_deals_write on public.crm_deals for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy crm_activities_select on public.crm_activities for select to authenticated
  using (public.is_org_member(organization_id));
create policy crm_activities_write on public.crm_activities for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy crm_orders_select on public.crm_orders for select to authenticated
  using (public.is_org_member(organization_id));
create policy crm_orders_write on public.crm_orders for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy crm_forms_select on public.crm_form_submissions for select to authenticated
  using (public.is_org_member(organization_id));
create policy crm_forms_write on public.crm_form_submissions for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy crm_reviews_select on public.crm_pipeline_reviews for select to authenticated
  using (public.is_org_member(organization_id));
create policy crm_reviews_write on public.crm_pipeline_reviews for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
