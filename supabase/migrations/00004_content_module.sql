-- Content module: pillars, items, comments, batch plans

create type public.content_platform as enum (
  'instagram',
  'facebook',
  'tiktok',
  'x',
  'linkedin',
  'youtube',
  'pinterest'
);

create type public.content_format as enum (
  'post',
  'carousel',
  'reel_script',
  'story',
  'thread',
  'short_script'
);

create type public.content_item_status as enum (
  'draft',
  'pending_approval',
  'approved',
  'scheduled',
  'published',
  'rejected'
);

create type public.content_plan_status as enum (
  'draft',
  'proposed',
  'partially_approved',
  'generating',
  'complete',
  'cancelled'
);

create type public.content_plan_slot_status as enum (
  'proposed',
  'approved',
  'rejected',
  'generated',
  'failed'
);

create table public.content_pillars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text,
  target_pct numeric(5, 2) not null default 0
    check (target_pct >= 0 and target_pct <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  title text not null,
  status public.content_plan_status not null default 'draft',
  start_date date not null,
  end_date date not null,
  brief jsonb not null default '{}'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  pillar_id uuid references public.content_pillars (id) on delete set null,
  platform public.content_platform not null,
  format public.content_format not null default 'post',
  status public.content_item_status not null default 'draft',
  title text,
  copy text not null default '',
  hashtags text[] not null default '{}',
  media_urls text[] not null default '{}',
  structured jsonb not null default '{}'::jsonb,
  compliance_flags jsonb not null default '[]'::jsonb,
  rejection_reason text,
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  ai_generated boolean not null default false,
  campaign_id uuid,
  plan_id uuid references public.content_plans (id) on delete set null,
  variant_group_id uuid,
  source_item_id uuid references public.content_items (id) on delete set null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_plan_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.content_plans (id) on delete cascade,
  pillar_id uuid references public.content_pillars (id) on delete set null,
  platform public.content_platform not null,
  format public.content_format not null default 'post',
  topic text not null,
  scheduled_at timestamptz,
  status public.content_plan_slot_status not null default 'proposed',
  content_item_id uuid references public.content_items (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null references public.content_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  comment text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index content_pillars_org_id_idx on public.content_pillars (organization_id);
create index content_pillars_brand_id_idx on public.content_pillars (brand_id);
create index content_items_org_id_idx on public.content_items (organization_id);
create index content_items_brand_id_idx on public.content_items (brand_id);
create index content_items_status_idx on public.content_items (status);
create index content_items_scheduled_at_idx on public.content_items (scheduled_at);
create index content_items_variant_group_id_idx on public.content_items (variant_group_id);
create index content_comments_item_id_idx on public.content_comments (item_id);
create index content_plans_org_id_idx on public.content_plans (organization_id);
create index content_plan_slots_plan_id_idx on public.content_plan_slots (plan_id);

create trigger content_pillars_set_updated_at
  before update on public.content_pillars
  for each row execute function public.set_updated_at();

create trigger content_items_set_updated_at
  before update on public.content_items
  for each row execute function public.set_updated_at();

create trigger content_plans_set_updated_at
  before update on public.content_plans
  for each row execute function public.set_updated_at();

create trigger content_plan_slots_set_updated_at
  before update on public.content_plan_slots
  for each row execute function public.set_updated_at();

alter table public.content_pillars enable row level security;
alter table public.content_items enable row level security;
alter table public.content_comments enable row level security;
alter table public.content_plans enable row level security;
alter table public.content_plan_slots enable row level security;

-- pillars
create policy content_pillars_select on public.content_pillars
  for select to authenticated using (public.is_org_member(organization_id));
create policy content_pillars_insert on public.content_pillars
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[])
  );
create policy content_pillars_update on public.content_pillars
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy content_pillars_delete on public.content_pillars
  for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

-- items
create policy content_items_select on public.content_items
  for select to authenticated using (public.is_org_member(organization_id));
create policy content_items_insert on public.content_items
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[])
  );
create policy content_items_update on public.content_items
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy content_items_delete on public.content_items
  for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

-- comments
create policy content_comments_select on public.content_comments
  for select to authenticated using (public.is_org_member(organization_id));
create policy content_comments_insert on public.content_comments
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[])
    and user_id = auth.uid()
  );
create policy content_comments_update on public.content_comments
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy content_comments_delete on public.content_comments
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[])
  );

-- plans
create policy content_plans_select on public.content_plans
  for select to authenticated using (public.is_org_member(organization_id));
create policy content_plans_insert on public.content_plans
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[])
  );
create policy content_plans_update on public.content_plans
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy content_plans_delete on public.content_plans
  for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

-- plan slots
create policy content_plan_slots_select on public.content_plan_slots
  for select to authenticated using (public.is_org_member(organization_id));
create policy content_plan_slots_insert on public.content_plan_slots
  for insert to authenticated with check (
    public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[])
  );
create policy content_plan_slots_update on public.content_plan_slots
  for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy content_plan_slots_delete on public.content_plan_slots
  for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

alter publication supabase_realtime add table public.content_items;
alter publication supabase_realtime add table public.content_plans;
