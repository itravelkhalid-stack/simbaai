-- Email marketing module

create type public.email_subscriber_status as enum (
  'subscribed',
  'unsubscribed',
  'bounced',
  'complained'
);

create type public.email_campaign_status as enum (
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled',
  'failed'
);

create type public.email_flow_status as enum (
  'draft',
  'active',
  'paused',
  'archived'
);

create type public.email_flow_trigger as enum (
  'signup',
  'tag_added',
  'date',
  'purchase',
  'abandoned'
);

create type public.email_event_type as enum (
  'queued',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'unsubscribed'
);

create type public.email_domain_status as enum (
  'pending',
  'verified',
  'failed',
  'temporary_failure',
  'not_started'
);

create table public.email_lists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  list_id uuid not null references public.email_lists (id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  custom_fields jsonb not null default '{}'::jsonb,
  status public.email_subscriber_status not null default 'subscribed',
  source text,
  consent_timestamp timestamptz,
  consent_source text,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_subscribers_email_lower check (email = lower(email)),
  constraint email_subscribers_list_email unique (list_id, email)
);

create table public.email_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint email_tags_org_name unique (organization_id, name)
);

create table public.email_subscriber_tags (
  subscriber_id uuid not null references public.email_subscribers (id) on delete cascade,
  tag_id uuid not null references public.email_tags (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (subscriber_id, tag_id)
);

create table public.email_segments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '{"combinator":"and","rules":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_suppression_list (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  reason text not null,
  source text,
  created_at timestamptz not null default now(),
  constraint email_suppression_email_lower check (email = lower(email)),
  constraint email_suppression_org_email unique (organization_id, email)
);

create table public.email_sending_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  domain text not null,
  resend_domain_id text,
  status public.email_domain_status not null default 'not_started',
  dns_records jsonb not null default '[]'::jsonb,
  from_email text,
  from_name text,
  physical_address text,
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  constraint email_sending_domains_org_domain unique (organization_id, domain)
);

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  subject text not null default '',
  subject_variants jsonb not null default '[]'::jsonb,
  ab_test boolean not null default false,
  preheader text,
  blocks jsonb not null default '[]'::jsonb,
  html_content text not null default '',
  plain_text text not null default '',
  status public.email_campaign_status not null default 'draft',
  list_ids uuid[] not null default '{}',
  segment_id uuid references public.email_segments (id) on delete set null,
  sending_domain_id uuid references public.email_sending_domains (id) on delete set null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  stats jsonb not null default '{"delivered":0,"opens":0,"clicks":0,"unsubscribes":0,"bounces":0,"complaints":0,"sent":0}'::jsonb,
  brief text,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_flows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  trigger_type public.email_flow_trigger not null default 'signup',
  status public.email_flow_status not null default 'draft',
  strategy jsonb not null default '{}'::jsonb,
  list_id uuid references public.email_lists (id) on delete set null,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.email_flow_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  flow_id uuid not null references public.email_flows (id) on delete cascade,
  position integer not null,
  delay_hours integer not null default 0,
  subject text not null default '',
  preheader text,
  blocks jsonb not null default '[]'::jsonb,
  html_content text not null default '',
  condition jsonb not null default '{}'::jsonb,
  goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_flow_steps_flow_position unique (flow_id, position)
);

create table public.email_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid references public.email_campaigns (id) on delete set null,
  flow_step_id uuid references public.email_flow_steps (id) on delete set null,
  subscriber_id uuid references public.email_subscribers (id) on delete set null,
  email text not null,
  event_type public.email_event_type not null,
  provider_message_id text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index email_lists_org_id_idx on public.email_lists (organization_id);
create index email_subscribers_org_id_idx on public.email_subscribers (organization_id);
create index email_subscribers_list_id_idx on public.email_subscribers (list_id);
create index email_subscribers_email_idx on public.email_subscribers (email);
create index email_subscribers_status_idx on public.email_subscribers (status);
create index email_campaigns_org_id_idx on public.email_campaigns (organization_id);
create index email_campaigns_status_idx on public.email_campaigns (status);
create index email_flows_org_id_idx on public.email_flows (organization_id);
create index email_flow_steps_flow_id_idx on public.email_flow_steps (flow_id);
create index email_events_campaign_id_idx on public.email_events (campaign_id);
create index email_events_org_id_idx on public.email_events (organization_id);
create index email_events_type_idx on public.email_events (event_type);
create index email_suppression_org_email_idx on public.email_suppression_list (organization_id, email);

create trigger email_lists_set_updated_at
  before update on public.email_lists
  for each row execute function public.set_updated_at();
create trigger email_subscribers_set_updated_at
  before update on public.email_subscribers
  for each row execute function public.set_updated_at();
create trigger email_segments_set_updated_at
  before update on public.email_segments
  for each row execute function public.set_updated_at();
create trigger email_campaigns_set_updated_at
  before update on public.email_campaigns
  for each row execute function public.set_updated_at();
create trigger email_flows_set_updated_at
  before update on public.email_flows
  for each row execute function public.set_updated_at();
create trigger email_flow_steps_set_updated_at
  before update on public.email_flow_steps
  for each row execute function public.set_updated_at();
create trigger email_sending_domains_set_updated_at
  before update on public.email_sending_domains
  for each row execute function public.set_updated_at();

alter table public.email_lists enable row level security;
alter table public.email_subscribers enable row level security;
alter table public.email_tags enable row level security;
alter table public.email_subscriber_tags enable row level security;
alter table public.email_segments enable row level security;
alter table public.email_suppression_list enable row level security;
alter table public.email_sending_domains enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_flows enable row level security;
alter table public.email_flow_steps enable row level security;
alter table public.email_events enable row level security;

-- Helper macro-style policies
create policy email_lists_select on public.email_lists for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_lists_insert on public.email_lists for insert to authenticated
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy email_lists_update on public.email_lists for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy email_lists_delete on public.email_lists for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy email_subscribers_select on public.email_subscribers for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_subscribers_insert on public.email_subscribers for insert to authenticated
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy email_subscribers_update on public.email_subscribers for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy email_subscribers_delete on public.email_subscribers for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy email_tags_select on public.email_tags for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_tags_write on public.email_tags for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy email_subscriber_tags_select on public.email_subscriber_tags for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_subscriber_tags_write on public.email_subscriber_tags for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy email_segments_select on public.email_segments for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_segments_write on public.email_segments for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy email_suppression_select on public.email_suppression_list for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_suppression_write on public.email_suppression_list for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy email_domains_select on public.email_sending_domains for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_domains_write on public.email_sending_domains for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

create policy email_campaigns_select on public.email_campaigns for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_campaigns_write on public.email_campaigns for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy email_flows_select on public.email_flows for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_flows_write on public.email_flows for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy email_flow_steps_select on public.email_flow_steps for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_flow_steps_write on public.email_flow_steps for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy email_events_select on public.email_events for select to authenticated
  using (public.is_org_member(organization_id));
create policy email_events_insert on public.email_events for insert to authenticated
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
