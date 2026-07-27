-- AI Team Ask: per-user conversation history (tenant-isolated)

create table public.team_ask_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  brand_id uuid references public.brands (id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_ask_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.team_ask_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  department text,
  tool_name text,
  tool_payload jsonb not null default '{}'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index team_ask_conversations_org_user_idx
  on public.team_ask_conversations (organization_id, user_id, updated_at desc);
create index team_ask_messages_conversation_idx
  on public.team_ask_messages (conversation_id, created_at);
create index team_ask_messages_org_created_idx
  on public.team_ask_messages (organization_id, created_at desc);

create trigger team_ask_conversations_set_updated_at
  before update on public.team_ask_conversations
  for each row execute function public.set_updated_at();

alter table public.team_ask_conversations enable row level security;
alter table public.team_ask_messages enable row level security;

create policy team_ask_conversations_select on public.team_ask_conversations
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

create policy team_ask_conversations_insert on public.team_ask_conversations
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

create policy team_ask_conversations_update on public.team_ask_conversations
  for update to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  )
  with check (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

create policy team_ask_conversations_delete on public.team_ask_conversations
  for delete to authenticated
  using (
    public.is_org_member(organization_id)
    and user_id = auth.uid()
  );

create policy team_ask_messages_select on public.team_ask_messages
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.team_ask_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

create policy team_ask_messages_insert on public.team_ask_messages
  for insert to authenticated
  with check (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.team_ask_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );
