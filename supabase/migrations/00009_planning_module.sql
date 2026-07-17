-- Marketing planning & execution

create type public.marketing_plan_period as enum ('quarter', 'month');

create type public.marketing_plan_status as enum (
  'draft',
  'pending_approval',
  'partially_approved',
  'approved',
  'active',
  'archived'
);

create type public.marketing_campaign_status as enum (
  'draft',
  'planned',
  'active',
  'paused',
  'completed',
  'cancelled'
);

create type public.campaign_task_module as enum (
  'content',
  'ads',
  'email',
  'seo',
  'social',
  'research',
  'other'
);

create type public.campaign_assignee_type as enum ('ai', 'human');

create type public.campaign_task_status as enum (
  'todo',
  'in_progress',
  'blocked',
  'in_review',
  'done',
  'cancelled'
);

create table public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  title text not null,
  goal_brief text not null,
  period_type public.marketing_plan_period not null default 'quarter',
  period_start date not null,
  period_end date not null,
  objectives jsonb not null default '[]'::jsonb,
  document jsonb not null default '{}'::jsonb,
  section_approvals jsonb not null default '{}'::jsonb,
  status public.marketing_plan_status not null default 'draft',
  budget_pence integer,
  currency text not null default 'GBP',
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  plan_id uuid references public.marketing_plans (id) on delete set null,
  name text not null,
  goal text,
  kpi jsonb not null default '[]'::jsonb,
  budget_pence integer not null default 0,
  spent_pence integer not null default 0,
  currency text not null default 'GBP',
  start_date date,
  end_date date,
  channels text[] not null default '{}',
  status public.marketing_campaign_status not null default 'planned',
  sort_order integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  title text not null,
  description text,
  module public.campaign_task_module not null default 'other',
  assignee_type public.campaign_assignee_type not null default 'ai',
  assignee_id uuid references auth.users (id) on delete set null,
  status public.campaign_task_status not null default 'todo',
  due_date date,
  linked_entity jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  task_id uuid references public.campaign_tasks (id) on delete set null,
  actor_type text not null default 'system',
  actor_id uuid,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index marketing_plans_org_id_idx on public.marketing_plans (organization_id);
create index marketing_plans_status_idx on public.marketing_plans (status);
create index campaigns_org_id_idx on public.campaigns (organization_id);
create index campaigns_plan_id_idx on public.campaigns (plan_id);
create index campaigns_dates_idx on public.campaigns (start_date, end_date);
create index campaign_tasks_campaign_id_idx on public.campaign_tasks (campaign_id);
create index campaign_tasks_assignee_idx on public.campaign_tasks (assignee_type, status, due_date);
create index campaign_tasks_org_id_idx on public.campaign_tasks (organization_id);
create index campaign_activities_campaign_id_idx on public.campaign_activities (campaign_id);
create index notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index notifications_org_id_idx on public.notifications (organization_id);

create trigger marketing_plans_set_updated_at
  before update on public.marketing_plans
  for each row execute function public.set_updated_at();
create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();
create trigger campaign_tasks_set_updated_at
  before update on public.campaign_tasks
  for each row execute function public.set_updated_at();

alter table public.marketing_plans enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_tasks enable row level security;
alter table public.campaign_activities enable row level security;
alter table public.notifications enable row level security;

create policy marketing_plans_select on public.marketing_plans for select to authenticated
  using (public.is_org_member(organization_id));
create policy marketing_plans_write on public.marketing_plans for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy campaigns_select on public.campaigns for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaigns_write on public.campaigns for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy campaign_tasks_select on public.campaign_tasks for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaign_tasks_write on public.campaign_tasks for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy campaign_activities_select on public.campaign_activities for select to authenticated
  using (public.is_org_member(organization_id));
create policy campaign_activities_insert on public.campaign_activities for insert to authenticated
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
