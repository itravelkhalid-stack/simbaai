-- Non-destructive pause for social + ad connections (tokens retained)

alter table public.social_connections
  add column if not exists paused boolean not null default false;

alter table public.ad_connections
  add column if not exists paused boolean not null default false;

comment on column public.social_connections.paused is
  'When true, skip publish/metrics/content-gen for this platform; tokens retained for instant resume.';

comment on column public.ad_connections.paused is
  'When true, skip ad metrics/sync writes that require a live connection; tokens retained.';

create index if not exists social_connections_org_active_unpaused_idx
  on public.social_connections (organization_id, brand_id, platform)
  where status = 'active' and paused = false;

create index if not exists ad_connections_org_active_unpaused_idx
  on public.ad_connections (organization_id, brand_id, platform)
  where status = 'active' and paused = false;
