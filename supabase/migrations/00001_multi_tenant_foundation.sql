-- GrowthOS multi-tenant foundation
-- Run in Supabase SQL editor or via supabase db push

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.org_member_role as enum (
  'org_owner',
  'org_admin',
  'org_member',
  'org_viewer'
);

create type public.membership_status as enum (
  'active',
  'invited',
  'removed'
);

create type public.invitation_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

create type public.agent_run_status as enum (
  'queued',
  'running',
  'complete',
  'failed'
);

create type public.org_plan as enum (
  'free',
  'starter',
  'growth',
  'agency'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  logo_url text,
  plan public.org_plan not null default 'free',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint organizations_slug_unique unique (slug)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.org_member_role not null default 'org_member',
  invited_by uuid references auth.users (id) on delete set null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint organization_members_unique unique (organization_id, user_id)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.org_member_role not null default 'org_member',
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid references auth.users (id) on delete set null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  constraint invitations_role_not_owner check (role <> 'org_owner'),
  constraint invitations_email_lower check (email = lower(email))
);

create unique index invitations_pending_org_email_idx
  on public.invitations (organization_id, email)
  where status = 'pending';

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  module text not null,
  agent_name text not null,
  status public.agent_run_status not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_pence integer not null default 0,
  duration_ms integer,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_members_user_id_idx on public.organization_members (user_id);
create index organization_members_org_id_idx on public.organization_members (organization_id);
create index invitations_token_idx on public.invitations (token);
create index agent_runs_org_id_idx on public.agent_runs (organization_id);
create index agent_runs_created_at_idx on public.agent_runs (created_at desc);

-- Enable PostgREST embeds: organization_members -> profiles
alter table public.organization_members
  add constraint organization_members_profile_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Security-definer helpers (platform admins bypass org scoping)
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = auth.uid()
  );
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    );
$$;

create or replace function public.has_org_role(
  p_organization_id uuid,
  p_roles public.org_member_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.status = 'active'
        and m.role = any (p_roles)
    );
$$;

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, public.org_member_role[]) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_member_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile bootstrap on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs: create organization, accept invitation
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
  p_name text,
  p_slug text
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organizations;
  v_slug text := lower(trim(p_slug));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if length(trim(p_name)) < 2 then
    raise exception 'Organization name is too short';
  end if;

  insert into public.organizations (name, slug)
  values (trim(p_name), v_slug)
  returning * into v_org;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    status
  )
  values (
    v_org.id,
    auth.uid(),
    'org_owner',
    'active'
  );

  return v_org;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns public.organization_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invitations;
  v_member public.organization_members;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select email into v_email
  from auth.users
  where id = auth.uid();

  select * into v_invite
  from public.invitations
  where token = p_token
  for update;

  if v_invite.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Invitation is no longer pending';
  end if;

  if v_invite.expires_at < now() then
    update public.invitations
    set status = 'expired'
    where id = v_invite.id;
    raise exception 'Invitation has expired';
  end if;

  if lower(v_email) <> lower(v_invite.email) then
    raise exception 'Invitation email does not match signed-in user';
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    invited_by,
    status
  )
  values (
    v_invite.organization_id,
    auth.uid(),
    v_invite.role,
    v_invite.invited_by,
    'active'
  )
  on conflict (organization_id, user_id) do update
    set
      role = excluded.role,
      status = 'active',
      invited_by = excluded.invited_by
  returning * into v_member;

  update public.invitations
  set status = 'accepted'
  where id = v_invite.id;

  return v_member;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.agent_runs enable row level security;

-- platform_admins
create policy platform_admins_select
  on public.platform_admins for select
  to authenticated
  using (public.is_platform_admin());

-- organizations
create policy organizations_select
  on public.organizations for select
  to authenticated
  using (public.is_org_member(id));

create policy organizations_update
  on public.organizations for update
  to authenticated
  using (public.has_org_role(id, array['org_owner', 'org_admin']::public.org_member_role[]))
  with check (public.has_org_role(id, array['org_owner', 'org_admin']::public.org_member_role[]));

create policy organizations_delete
  on public.organizations for delete
  to authenticated
  using (public.has_org_role(id, array['org_owner']::public.org_member_role[]));

-- profiles
create policy profiles_select_own_or_admin
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members me
      join public.organization_members them
        on them.organization_id = me.organization_id
      where me.user_id = auth.uid()
        and me.status = 'active'
        and them.user_id = profiles.id
        and them.status = 'active'
    )
  );

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_insert_own
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

-- organization_members
create policy organization_members_select
  on public.organization_members for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy organization_members_insert
  on public.organization_members for insert
  to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

create policy organization_members_update
  on public.organization_members for update
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

create policy organization_members_delete
  on public.organization_members for delete
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

-- invitations
create policy invitations_select
  on public.invitations for select
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
    or (
      status = 'pending'
      and email = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

create policy invitations_insert
  on public.invitations for insert
  to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

create policy invitations_update
  on public.invitations for update
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

create policy invitations_delete
  on public.invitations for delete
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

-- agent_runs
create policy agent_runs_select
  on public.agent_runs for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy agent_runs_insert
  on public.agent_runs for insert
  to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy agent_runs_update
  on public.agent_runs for update
  to authenticated
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

create policy agent_runs_delete
  on public.agent_runs for delete
  to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );
