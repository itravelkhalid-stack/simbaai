-- AI media tagging fields + per-brand enabled channels

alter table public.media_assets
  add column if not exists description text,
  add column if not exists ai_subject text,
  add column if not exists ai_style text,
  add column if not exists ai_colors text[] not null default '{}',
  add column if not exists suitable_for text[] not null default '{}',
  add column if not exists ai_tagged_at timestamptz;

comment on column public.media_assets.description is 'Short AI or human description for matching to content topics';
comment on column public.media_assets.ai_subject is 'Primary subject from vision tagging';
comment on column public.media_assets.ai_style is 'Visual style from vision tagging';
comment on column public.media_assets.ai_colors is 'Dominant colors from vision tagging';
comment on column public.media_assets.suitable_for is 'Use-case tags (e.g. product, lifestyle, offer)';

alter table public.brands
  add column if not exists enabled_channels text[] not null default '{}';

comment on column public.brands.enabled_channels is
  'Content/ad channels this brand operates. Empty = derive from connected accounts.';

create index if not exists media_assets_suitable_for_gin
  on public.media_assets using gin (suitable_for);
