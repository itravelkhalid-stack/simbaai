-- AI meetings module

create type public.meeting_type as enum (
  'daily_standup',
  'weekly_marketing',
  'monthly_board',
  'quarterly_board',
  'adhoc'
);

create type public.meeting_status as enum (
  'scheduled',
  'running',
  'complete',
  'failed',
  'cancelled'
);

create type public.meeting_owner_type as enum ('ai', 'human');

create type public.meeting_action_status as enum (
  'open',
  'in_progress',
  'done',
  'cancelled'
);

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  type public.meeting_type not null,
  title text not null,
  scheduled_for timestamptz not null,
  status public.meeting_status not null default 'scheduled',
  agenda jsonb not null default '[]'::jsonb,
  minutes_markdown text not null default '',
  executive_summary text,
  decisions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  context_snapshot jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meeting_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  description text not null,
  owner_type public.meeting_owner_type not null default 'human',
  owner_id uuid references auth.users (id) on delete set null,
  due_date date,
  status public.meeting_action_status not null default 'open',
  linked_task_id uuid references public.campaign_tasks (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meeting_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meeting_chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index meetings_org_id_idx on public.meetings (organization_id);
create index meetings_brand_id_idx on public.meetings (brand_id);
create index meetings_scheduled_for_idx on public.meetings (scheduled_for desc);
create index meetings_type_status_idx on public.meetings (type, status);
create index meeting_actions_meeting_id_idx on public.meeting_actions (meeting_id);
create index meeting_actions_status_idx on public.meeting_actions (status);
create index meeting_comments_meeting_id_idx on public.meeting_comments (meeting_id);
create index meeting_chat_messages_meeting_id_idx on public.meeting_chat_messages (meeting_id, created_at);

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();
create trigger meeting_actions_set_updated_at
  before update on public.meeting_actions
  for each row execute function public.set_updated_at();
create trigger meeting_comments_set_updated_at
  before update on public.meeting_comments
  for each row execute function public.set_updated_at();

alter table public.meetings enable row level security;
alter table public.meeting_actions enable row level security;
alter table public.meeting_comments enable row level security;
alter table public.meeting_chat_messages enable row level security;

create policy meetings_select on public.meetings for select to authenticated
  using (public.is_org_member(organization_id));
create policy meetings_write on public.meetings for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy meeting_actions_select on public.meeting_actions for select to authenticated
  using (public.is_org_member(organization_id));
create policy meeting_actions_write on public.meeting_actions for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy meeting_comments_select on public.meeting_comments for select to authenticated
  using (public.is_org_member(organization_id));
create policy meeting_comments_insert on public.meeting_comments for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );
create policy meeting_comments_update on public.meeting_comments for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy meeting_comments_delete on public.meeting_comments for delete to authenticated
  using (user_id = auth.uid() or public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy meeting_chat_select on public.meeting_chat_messages for select to authenticated
  using (public.is_org_member(organization_id));
create policy meeting_chat_insert on public.meeting_chat_messages for insert to authenticated
  with check (public.is_org_member(organization_id));
