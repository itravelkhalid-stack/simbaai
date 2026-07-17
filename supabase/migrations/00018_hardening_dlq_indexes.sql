-- Phase 18: resilience DLQ + performance index audit

create table if not exists public.job_dead_letters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  provider text not null,
  job_name text not null,
  event_name text,
  payload jsonb not null default '{}'::jsonb,
  error text not null,
  attempts int not null default 0,
  status text not null default 'open'
    check (status in ('open', 'retrying', 'resolved', 'discarded')),
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  last_error_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_dead_letters_status_idx
  on public.job_dead_letters (status, created_at desc);
create index if not exists job_dead_letters_org_idx
  on public.job_dead_letters (organization_id, created_at desc);

create trigger job_dead_letters_set_updated_at
  before update on public.job_dead_letters
  for each row execute function public.set_updated_at();

alter table public.job_dead_letters enable row level security;

create policy job_dead_letters_admin on public.job_dead_letters for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Index audit: org_id + common filters missing from earlier modules
create index if not exists crm_deals_org_idx on public.crm_deals (organization_id, updated_at desc);
create index if not exists crm_activities_org_idx on public.crm_activities (organization_id, created_at desc);
create index if not exists crm_orders_org_idx on public.crm_orders (organization_id, created_at desc);
create index if not exists meeting_actions_org_idx on public.meeting_actions (organization_id, status);
create index if not exists content_items_org_status_idx on public.content_items (organization_id, status, created_at desc);
create index if not exists agent_runs_org_status_idx on public.agent_runs (organization_id, status, created_at desc);
create index if not exists notifications_org_user_idx on public.notifications (organization_id, user_id, created_at desc);
create index if not exists audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);
create index if not exists automation_runs_org_idx on public.automation_runs (organization_id, created_at desc);
create index if not exists reports_org_status_idx on public.reports (organization_id, status, created_at desc);

-- Integration health snapshots (platform admin / banners)
create table if not exists public.integration_health (
  provider text primary key,
  status text not null default 'unknown'
    check (status in ('ok', 'degraded', 'down', 'unknown')),
  detail text,
  checked_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

alter table public.integration_health enable row level security;

create policy integration_health_read on public.integration_health for select to authenticated
  using (true);
create policy integration_health_admin_write on public.integration_health for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
