-- Brand media library, content ↔ media attachments, guidelines PDF proposals

create type public.media_asset_type as enum (
  'image',
  'video',
  'logo',
  'document',
  'font'
);

create type public.media_asset_source as enum ('upload', 'ai');

create type public.brand_guidelines_proposal_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  type public.media_asset_type not null,
  storage_path text not null,
  public_url text not null,
  filename text not null,
  mime_type text,
  width integer,
  height integer,
  size_bytes bigint not null default 0,
  tags text[] not null default '{}',
  source public.media_asset_source not null default 'upload',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index media_assets_org_idx on public.media_assets (organization_id);
create index media_assets_brand_idx on public.media_assets (brand_id);
create index media_assets_type_idx on public.media_assets (organization_id, type);
create index media_assets_tags_gin on public.media_assets using gin (tags);

alter table public.media_assets enable row level security;

create policy media_assets_select on public.media_assets
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy media_assets_update on public.media_assets
  for update to authenticated
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

create policy media_assets_delete on public.media_assets
  for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

-- Many-to-many: content items ↔ media assets
create table public.content_item_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  media_asset_id uuid not null references public.media_assets (id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (content_item_id, media_asset_id)
);

create index content_item_media_org_idx on public.content_item_media (organization_id);
create index content_item_media_item_idx on public.content_item_media (content_item_id);
create index content_item_media_asset_idx on public.content_item_media (media_asset_id);

alter table public.content_item_media enable row level security;

create policy content_item_media_select on public.content_item_media
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy content_item_media_insert on public.content_item_media
  for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy content_item_media_update on public.content_item_media
  for update to authenticated
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

create policy content_item_media_delete on public.content_item_media
  for delete to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

-- Guidelines PDF extraction proposals (approve before overwrite)
create table public.brand_guidelines_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  media_asset_id uuid references public.media_assets (id) on delete set null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  status public.brand_guidelines_proposal_status not null default 'pending',
  proposed jsonb not null default '{}'::jsonb,
  current_snapshot jsonb not null default '{}'::jsonb,
  summary text,
  created_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_guidelines_proposals_org_idx
  on public.brand_guidelines_proposals (organization_id);
create index brand_guidelines_proposals_brand_idx
  on public.brand_guidelines_proposals (brand_id, status);

alter table public.brand_guidelines_proposals enable row level security;

create policy brand_guidelines_proposals_select on public.brand_guidelines_proposals
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy brand_guidelines_proposals_insert on public.brand_guidelines_proposals
  for insert to authenticated
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );

create policy brand_guidelines_proposals_update on public.brand_guidelines_proposals
  for update to authenticated
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

-- Private brand-media bucket.
-- Access model (see docs/brand-media-storage.md):
--   - Authenticated reads are org-scoped via path prefix {organization_id}/…
--   - No anon/public blanket read (avoids cross-tenant leakage)
--   - Instagram/Facebook Graph fetch uses long-lived signed URLs minted
--     at publish time by the service role (lib/media/storage.ts)
insert into storage.buckets (id, name, public)
values ('brand-media', 'brand-media', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists brand_media_select on storage.objects;
drop policy if exists brand_media_select_anon on storage.objects;

create policy brand_media_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'brand-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Uploads/deletes via service role (admin client) only — no authenticated write policies
