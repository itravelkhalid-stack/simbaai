-- Meta OAuth page-picker sessions + public content media bucket

create table public.social_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram')),
  user_access_token_encrypted text not null,
  token_expires_at timestamptz,
  pages jsonb not null default '[]'::jsonb,
  scopes text[] not null default '{}',
  created_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

create index social_oauth_sessions_org_idx on public.social_oauth_sessions (organization_id);
create index social_oauth_sessions_expires_idx on public.social_oauth_sessions (expires_at);

alter table public.social_oauth_sessions enable row level security;

create policy social_oauth_sessions_select on public.social_oauth_sessions
  for select to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

create policy social_oauth_sessions_delete on public.social_oauth_sessions
  for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin']::public.org_member_role[]
    )
  );

-- Writes go through service role after OAuth callback

-- Public HTTPS media for Instagram Graph (public URL required)
insert into storage.buckets (id, name, public)
values ('content-media', 'content-media', true)
on conflict (id) do nothing;

create policy content_media_select on storage.objects for select to authenticated
  using (bucket_id = 'content-media');
create policy content_media_select_anon on storage.objects for select to anon
  using (bucket_id = 'content-media');
-- Uploads via service role (admin client) only — no authenticated insert policy
