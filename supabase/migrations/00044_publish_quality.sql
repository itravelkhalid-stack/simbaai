-- Publish quality: link allowlist, media format suitability, usage tracking.

alter table public.brands
  add column if not exists allowed_link_urls text[] not null default '{}'::text[];

comment on column public.brands.allowed_link_urls is
  'Extra allowlisted URL prefixes/paths for content links (plus website + product URLs).';

alter table public.media_assets
  add column if not exists suitable_formats text[] not null default '{}'::text[];

alter table public.media_assets
  add column if not exists is_derived boolean not null default false;

alter table public.media_assets
  add column if not exists derived_from_asset_id uuid
    references public.media_assets (id) on delete set null;

comment on column public.media_assets.suitable_formats is
  'Format slots this asset may auto-attach to (instagram_story, instagram_feed, facebook_feed, linkedin_feed).';

create table if not exists public.media_asset_usages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  media_asset_id uuid not null references public.media_assets (id) on delete cascade,
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  platform text not null,
  format text not null,
  used_at timestamptz not null default now(),
  engagement_score numeric null
);

create index if not exists media_asset_usages_asset_idx
  on public.media_asset_usages (media_asset_id, used_at desc);

create index if not exists media_asset_usages_brand_idx
  on public.media_asset_usages (brand_id, used_at desc);

create index if not exists media_asset_usages_item_idx
  on public.media_asset_usages (content_item_id);

alter table public.media_asset_usages enable row level security;

create policy media_asset_usages_select on public.media_asset_usages
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy media_asset_usages_write on public.media_asset_usages
  for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
