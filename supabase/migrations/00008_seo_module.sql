-- SEO module

create type public.seo_keyword_intent as enum (
  'informational',
  'navigational',
  'commercial',
  'transactional'
);

create type public.seo_keyword_priority as enum (
  'low',
  'medium',
  'high',
  'critical'
);

create type public.seo_page_status as enum (
  'pending',
  'ok',
  'needs_work',
  'critical',
  'ignored'
);

create type public.seo_brief_status as enum (
  'draft',
  'ready',
  'in_progress',
  'completed',
  'archived'
);

create type public.seo_article_status as enum (
  'draft',
  'review',
  'approved',
  'published',
  'archived'
);

create table public.seo_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  domain text not null,
  gsc_connected boolean not null default false,
  gsc_site_url text,
  gsc_access_token_encrypted text,
  gsc_refresh_token_encrypted text,
  gsc_token_expires_at timestamptz,
  keyword_map jsonb not null default '{"pillars":[]}'::jsonb,
  last_audit_at timestamptz,
  last_gsc_sync_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_projects_org_domain unique (organization_id, domain)
);

create table public.seo_keywords (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.seo_projects (id) on delete cascade,
  keyword text not null,
  intent public.seo_keyword_intent not null default 'informational',
  volume integer,
  difficulty integer,
  current_position numeric(8, 2),
  previous_position numeric(8, 2),
  target_url text,
  priority public.seo_keyword_priority not null default 'medium',
  pillar text,
  cluster text,
  tracked boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_keywords_project_keyword unique (project_id, keyword)
);

create table public.seo_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.seo_projects (id) on delete cascade,
  url text not null,
  title text,
  meta_description text,
  h1 text,
  status public.seo_page_status not null default 'pending',
  issues jsonb not null default '[]'::jsonb,
  word_count integer,
  has_schema boolean not null default false,
  missing_alt_count integer not null default 0,
  broken_link_count integer not null default 0,
  pagespeed_score integer,
  pagespeed_raw jsonb not null default '{}'::jsonb,
  last_audited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seo_pages_project_url unique (project_id, url)
);

create table public.seo_content_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.seo_projects (id) on delete cascade,
  keyword_id uuid not null references public.seo_keywords (id) on delete cascade,
  title text not null,
  brief_markdown text not null default '',
  outline jsonb not null default '[]'::jsonb,
  entities text[] not null default '{}',
  internal_links text[] not null default '{}',
  target_word_count integer not null default 1200,
  search_intent text,
  status public.seo_brief_status not null default 'draft',
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seo_articles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.seo_projects (id) on delete cascade,
  brief_id uuid not null references public.seo_content_briefs (id) on delete cascade,
  title text not null,
  content_markdown text not null default '',
  status public.seo_article_status not null default 'draft',
  published_url text,
  checklist_score integer,
  checklist jsonb not null default '{}'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seo_gsc_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.seo_projects (id) on delete cascade,
  metric_date date not null,
  query text not null default '',
  page text not null default '',
  impressions integer not null default 0,
  clicks integer not null default 0,
  ctr numeric(10, 6) not null default 0,
  position numeric(10, 4) not null default 0,
  created_at timestamptz not null default now(),
  constraint seo_gsc_daily_unique unique (project_id, metric_date, query, page)
);

create table public.seo_weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.seo_projects (id) on delete cascade,
  week_start date not null,
  week_end date not null,
  summary_markdown text not null,
  highlights jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint seo_weekly_summaries_project_week unique (project_id, week_start)
);

create index seo_projects_org_id_idx on public.seo_projects (organization_id);
create index seo_keywords_project_id_idx on public.seo_keywords (project_id);
create index seo_keywords_tracked_idx on public.seo_keywords (project_id) where tracked = true;
create index seo_pages_project_id_idx on public.seo_pages (project_id);
create index seo_content_briefs_project_id_idx on public.seo_content_briefs (project_id);
create index seo_articles_project_id_idx on public.seo_articles (project_id);
create index seo_articles_status_idx on public.seo_articles (status);
create index seo_gsc_daily_project_date_idx on public.seo_gsc_daily (project_id, metric_date);
create index seo_gsc_daily_query_idx on public.seo_gsc_daily (project_id, query);
create index seo_weekly_summaries_org_id_idx on public.seo_weekly_summaries (organization_id);

create trigger seo_projects_set_updated_at
  before update on public.seo_projects
  for each row execute function public.set_updated_at();
create trigger seo_keywords_set_updated_at
  before update on public.seo_keywords
  for each row execute function public.set_updated_at();
create trigger seo_pages_set_updated_at
  before update on public.seo_pages
  for each row execute function public.set_updated_at();
create trigger seo_content_briefs_set_updated_at
  before update on public.seo_content_briefs
  for each row execute function public.set_updated_at();
create trigger seo_articles_set_updated_at
  before update on public.seo_articles
  for each row execute function public.set_updated_at();

alter table public.seo_projects enable row level security;
alter table public.seo_keywords enable row level security;
alter table public.seo_pages enable row level security;
alter table public.seo_content_briefs enable row level security;
alter table public.seo_articles enable row level security;
alter table public.seo_gsc_daily enable row level security;
alter table public.seo_weekly_summaries enable row level security;

create policy seo_projects_select on public.seo_projects for select to authenticated
  using (public.is_org_member(organization_id));
create policy seo_projects_write on public.seo_projects for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy seo_keywords_select on public.seo_keywords for select to authenticated
  using (public.is_org_member(organization_id));
create policy seo_keywords_write on public.seo_keywords for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy seo_pages_select on public.seo_pages for select to authenticated
  using (public.is_org_member(organization_id));
create policy seo_pages_write on public.seo_pages for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy seo_briefs_select on public.seo_content_briefs for select to authenticated
  using (public.is_org_member(organization_id));
create policy seo_briefs_write on public.seo_content_briefs for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy seo_articles_select on public.seo_articles for select to authenticated
  using (public.is_org_member(organization_id));
create policy seo_articles_write on public.seo_articles for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy seo_gsc_select on public.seo_gsc_daily for select to authenticated
  using (public.is_org_member(organization_id));
create policy seo_gsc_write on public.seo_gsc_daily for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));

create policy seo_weekly_select on public.seo_weekly_summaries for select to authenticated
  using (public.is_org_member(organization_id));
create policy seo_weekly_write on public.seo_weekly_summaries for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
