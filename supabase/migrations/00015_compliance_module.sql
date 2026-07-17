-- Compliance module

create type public.compliance_entity_type as enum (
  'content',
  'ad',
  'email',
  'seo_article'
);

create type public.compliance_check_status as enum (
  'pass',
  'warn',
  'fail'
);

create type public.compliance_industry_preset as enum (
  'general_ecommerce',
  'financial_promotions',
  'health_wellness',
  'alcohol',
  'childrens_products',
  'custom'
);

alter table public.organizations
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deletion_scheduled_for timestamptz,
  add column if not exists deletion_requested_by uuid references auth.users (id) on delete set null;

create table public.compliance_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade unique,
  industry public.compliance_industry_preset not null default 'general_ecommerce',
  jurisdictions text[] not null default '{}',
  regulated boolean not null default false,
  rules jsonb not null default '[]'::jsonb,
  required_disclaimers text[] not null default '{}',
  banned_claims text[] not null default '{}',
  banned_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.compliance_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  entity_type public.compliance_entity_type not null,
  entity_id uuid not null,
  status public.compliance_check_status not null default 'pass',
  findings jsonb not null default '[]'::jsonb,
  checked_at timestamptz not null default now(),
  override_by uuid references auth.users (id) on delete set null,
  override_reason text,
  overridden_at timestamptz,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  before_state jsonb,
  after_state jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index compliance_profiles_org_idx on public.compliance_profiles (organization_id);
create index compliance_checks_org_idx on public.compliance_checks (organization_id, checked_at desc);
create index compliance_checks_entity_idx on public.compliance_checks (entity_type, entity_id, checked_at desc);
create index audit_events_org_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_action_idx on public.audit_events (organization_id, action);
create index organizations_deletion_due_idx on public.organizations (deletion_scheduled_for)
  where deletion_scheduled_for is not null;

create trigger compliance_profiles_set_updated_at
  before update on public.compliance_profiles
  for each row execute function public.set_updated_at();

alter table public.compliance_profiles enable row level security;
alter table public.compliance_checks enable row level security;
alter table public.audit_events enable row level security;

create policy compliance_profiles_select on public.compliance_profiles for select to authenticated
  using (public.is_org_member(organization_id));
create policy compliance_profiles_write on public.compliance_profiles for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy compliance_checks_select on public.compliance_checks for select to authenticated
  using (public.is_org_member(organization_id));
create policy compliance_checks_write on public.compliance_checks for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

-- Immutable audit log: insert + select only (no update/delete policies)
create policy audit_events_select on public.audit_events for select to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner','org_admin']::public.org_member_role[]
    )
  );
create policy audit_events_insert on public.audit_events for insert to authenticated
  with check (public.is_org_member(organization_id));
