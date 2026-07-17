-- Research engine tables + agent_runs streaming fields

create type public.research_project_type as enum (
  'brand_audit',
  'competitor',
  'market',
  'keyword',
  'audience',
  'trend'
);

create type public.research_project_status as enum (
  'draft',
  'queued',
  'running',
  'complete',
  'failed'
);

alter table public.agent_runs
  add column if not exists logs jsonb not null default '[]'::jsonb,
  add column if not exists progress integer not null default 0,
  add column if not exists model text,
  add column if not exists research_project_id uuid;

create table public.research_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  type public.research_project_type not null,
  status public.research_project_status not null default 'draft',
  title text not null,
  brief jsonb not null default '{}'::jsonb,
  latest_agent_run_id uuid references public.agent_runs (id) on delete set null,
  refreshed_from_id uuid references public.research_projects (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.agent_runs
  add constraint agent_runs_research_project_id_fkey
  foreign key (research_project_id)
  references public.research_projects (id)
  on delete set null;

create table public.research_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.research_projects (id) on delete cascade,
  section text not null,
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  confidence numeric(4, 3),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  website text,
  social_handles jsonb not null default '{}'::jsonb,
  positioning text,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  pricing_notes text,
  content_strategy text,
  ad_presence text,
  seo_strengths text,
  social_performance text,
  comparison jsonb not null default '{}'::jsonb,
  source_research_project_id uuid references public.research_projects (id) on delete set null,
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brand_audiences
  add constraint brand_audiences_source_research_project_id_fkey
  foreign key (source_research_project_id)
  references public.research_projects (id)
  on delete set null;

create index research_projects_org_id_idx on public.research_projects (organization_id);
create index research_projects_brand_id_idx on public.research_projects (brand_id);
create index research_projects_type_idx on public.research_projects (type);
create index research_projects_status_idx on public.research_projects (status);
create index research_documents_project_id_idx on public.research_documents (project_id);
create index research_documents_org_id_idx on public.research_documents (organization_id);
create index competitors_org_id_idx on public.competitors (organization_id);
create index competitors_brand_id_idx on public.competitors (brand_id);
create index agent_runs_research_project_id_idx on public.agent_runs (research_project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger research_projects_set_updated_at
  before update on public.research_projects
  for each row execute function public.set_updated_at();

create trigger research_documents_set_updated_at
  before update on public.research_documents
  for each row execute function public.set_updated_at();

create trigger competitors_set_updated_at
  before update on public.competitors
  for each row execute function public.set_updated_at();

create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.set_updated_at();

alter table public.research_projects enable row level security;
alter table public.research_documents enable row level security;
alter table public.competitors enable row level security;

-- research_projects
create policy research_projects_select
  on public.research_projects for select to authenticated
  using (public.is_org_member(organization_id));

create policy research_projects_insert
  on public.research_projects for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy research_projects_update
  on public.research_projects for update to authenticated
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

create policy research_projects_delete
  on public.research_projects for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

-- research_documents
create policy research_documents_select
  on public.research_documents for select to authenticated
  using (public.is_org_member(organization_id));

create policy research_documents_insert
  on public.research_documents for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy research_documents_update
  on public.research_documents for update to authenticated
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

create policy research_documents_delete
  on public.research_documents for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

-- competitors
create policy competitors_select
  on public.competitors for select to authenticated
  using (public.is_org_member(organization_id));

create policy competitors_insert
  on public.competitors for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy competitors_update
  on public.competitors for update to authenticated
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

create policy competitors_delete
  on public.competitors for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

-- Realtime: stream agent_runs progress to the Research UI
alter publication supabase_realtime add table public.agent_runs;
alter publication supabase_realtime add table public.research_projects;
