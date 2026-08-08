-- CMO / human approval attribution on content items.

alter table public.content_items
  add column if not exists approval_label text;

alter table public.content_items
  add column if not exists approved_at timestamptz;

alter table public.content_items
  add column if not exists cmo_note text;

alter table public.content_items
  add column if not exists cmo_regeneration_attempted boolean not null default false;

comment on column public.content_items.approval_label is
  'Display attribution e.g. "Approved by CMO (Simba)" or human display name.';

comment on column public.content_items.cmo_note is
  'Dashboard note when CMO parks an item for a human (compliance/brand-fit/image).';

comment on column public.content_items.cmo_regeneration_attempted is
  'True after CMO already attempted one compliance-driven regeneration.';
