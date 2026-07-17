-- Platform admin, onboarding, notifications enhancements

create type public.notification_category as enum (
  'approvals',
  'blockers',
  'anomalies',
  'reports',
  'meetings',
  'general'
);

create type public.email_digest_preference as enum (
  'immediate',
  'daily',
  'off'
);

alter table public.notifications
  add column if not exists category public.notification_category not null default 'general';

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category public.notification_category not null,
  email_digest public.email_digest_preference not null default 'immediate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category)
);

create table public.org_notification_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  slack_webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.org_feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  flag_key text not null,
  enabled boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, flag_key)
);

create table public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info',
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.org_onboarding_progress (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  steps jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index org_feature_flags_org_idx on public.org_feature_flags (organization_id);
create index platform_announcements_active_idx on public.platform_announcements (active, starts_at desc);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();
create trigger org_notification_settings_set_updated_at
  before update on public.org_notification_settings
  for each row execute function public.set_updated_at();
create trigger org_feature_flags_set_updated_at
  before update on public.org_feature_flags
  for each row execute function public.set_updated_at();
create trigger platform_announcements_set_updated_at
  before update on public.platform_announcements
  for each row execute function public.set_updated_at();
create trigger org_onboarding_progress_set_updated_at
  before update on public.org_onboarding_progress
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.org_notification_settings enable row level security;
alter table public.org_feature_flags enable row level security;
alter table public.platform_announcements enable row level security;
alter table public.org_onboarding_progress enable row level security;

create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy org_notification_settings_select on public.org_notification_settings for select to authenticated
  using (public.is_org_member(organization_id));
create policy org_notification_settings_write on public.org_notification_settings for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy org_feature_flags_select on public.org_feature_flags for select to authenticated
  using (public.is_org_member(organization_id) or public.is_platform_admin());
create policy org_feature_flags_write on public.org_feature_flags for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy platform_announcements_select on public.platform_announcements for select to authenticated
  using (active = true or public.is_platform_admin());
create policy platform_announcements_write on public.platform_announcements for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy org_onboarding_select on public.org_onboarding_progress for select to authenticated
  using (public.is_org_member(organization_id));
create policy org_onboarding_write on public.org_onboarding_progress for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
