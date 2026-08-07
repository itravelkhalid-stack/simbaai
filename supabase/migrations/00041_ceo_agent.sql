-- CEO accountability checks + per-brand registry "hiring" (activations).

create table if not exists public.ceo_checks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  checked_at timestamptz not null default now(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  departments jsonb not null default '[]'::jsonb,
  kpi_summary jsonb not null default '{}'::jsonb,
  actions_taken jsonb not null default '[]'::jsonb,
  hire_proposals jsonb not null default '[]'::jsonb,
  ai_judgment jsonb not null default '{}'::jsonb,
  accountability_markdown text not null default '',
  state_of_company_markdown text,
  overall_status text not null default 'ok'
    check (overall_status in ('ok', 'behind', 'failing')),
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ceo_checks_brand_checked_idx
  on public.ceo_checks (brand_id, checked_at desc);

create index if not exists ceo_checks_org_checked_idx
  on public.ceo_checks (organization_id, checked_at desc);

alter table public.ceo_checks enable row level security;

drop policy if exists ceo_checks_select on public.ceo_checks;
drop policy if exists ceo_checks_write on public.ceo_checks;
drop policy if exists ceo_checks_insert on public.ceo_checks;
drop policy if exists ceo_checks_update on public.ceo_checks;
drop policy if exists ceo_checks_delete on public.ceo_checks;

create policy ceo_checks_select on public.ceo_checks for select to authenticated
  using (public.is_org_member(organization_id));

create policy ceo_checks_write on public.ceo_checks for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

comment on table public.ceo_checks is
  'Deterministic + AI CEO accountability snapshots per brand (feeds standup / weekly).';

create table if not exists public.brand_agent_activations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  agent_id text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'active', 'declined', 'disabled')),
  mandate text not null default '',
  proposed_by text not null default 'ceo',
  proposed_reason text,
  ceo_check_id uuid references public.ceo_checks (id) on delete set null,
  activated_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, agent_id)
);

create index if not exists brand_agent_activations_org_idx
  on public.brand_agent_activations (organization_id);

create index if not exists brand_agent_activations_status_idx
  on public.brand_agent_activations (brand_id, status);

alter table public.brand_agent_activations enable row level security;

drop policy if exists brand_agent_activations_select on public.brand_agent_activations;
drop policy if exists brand_agent_activations_write on public.brand_agent_activations;
drop policy if exists brand_agent_activations_insert on public.brand_agent_activations;
drop policy if exists brand_agent_activations_update on public.brand_agent_activations;
drop policy if exists brand_agent_activations_delete on public.brand_agent_activations;

create policy brand_agent_activations_select on public.brand_agent_activations for select to authenticated
  using (public.is_org_member(organization_id));

create policy brand_agent_activations_write on public.brand_agent_activations for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

comment on table public.brand_agent_activations is
  'CEO hiring = registry activation. proposed→approval or autonomous activate; never invent non-registry agent_ids.';
