-- Brand foundation (required by Research: brand_id + push insights)

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  website text,
  positioning text,
  brand_voice text,
  target_audience text,
  guidelines jsonb not null default '{}'::jsonb,
  social_handles jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index brands_one_primary_per_org_idx
  on public.brands (organization_id)
  where is_primary = true;

create table public.brand_audiences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text,
  demographics jsonb not null default '{}'::jsonb,
  psychographics jsonb not null default '{}'::jsonb,
  channel_behaviour jsonb not null default '{}'::jsonb,
  messaging_angles text[] not null default '{}',
  source_research_project_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brands_organization_id_idx on public.brands (organization_id);
create index brand_audiences_org_id_idx on public.brand_audiences (organization_id);
create index brand_audiences_brand_id_idx on public.brand_audiences (brand_id);

alter table public.brands enable row level security;
alter table public.brand_audiences enable row level security;

create policy brands_select
  on public.brands for select to authenticated
  using (public.is_org_member(organization_id));

create policy brands_insert
  on public.brands for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy brands_update
  on public.brands for update to authenticated
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

create policy brands_delete
  on public.brands for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

create policy brand_audiences_select
  on public.brand_audiences for select to authenticated
  using (public.is_org_member(organization_id));

create policy brand_audiences_insert
  on public.brand_audiences for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy brand_audiences_update
  on public.brand_audiences for update to authenticated
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

create policy brand_audiences_delete
  on public.brand_audiences for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

-- Ensure every org gets a primary brand on creation (backfill + trigger)
create or replace function public.ensure_primary_brand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.brands (
    organization_id,
    name,
    is_primary
  )
  values (
    new.id,
    new.name,
    true
  );
  return new;
end;
$$;

create trigger organizations_create_primary_brand
  after insert on public.organizations
  for each row execute function public.ensure_primary_brand();

insert into public.brands (organization_id, name, is_primary)
select o.id, o.name, true
from public.organizations o
where not exists (
  select 1 from public.brands b where b.organization_id = o.id
);
