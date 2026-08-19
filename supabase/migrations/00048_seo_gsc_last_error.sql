-- Surface GSC OAuth/sync failures instead of silent empty charts.

alter table public.seo_projects
  add column if not exists gsc_last_error text;

comment on column public.seo_projects.gsc_last_error is
  'Human-readable GSC sync or OAuth refresh failure; cleared on successful sync.';
