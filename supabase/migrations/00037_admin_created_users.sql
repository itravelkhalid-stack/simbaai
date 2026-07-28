-- Admin-created team accounts: force password change on first login.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

comment on column public.profiles.must_change_password is
  'When true, user must set a new password before using the app (admin-created or admin-reset accounts).';
