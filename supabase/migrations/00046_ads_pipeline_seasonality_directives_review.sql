-- Meta Ads pipeline: destination seasonality, campaign directives, targeting briefs, launch review board.

-- ---------------------------------------------------------------------------
-- Destination seasonality (per brand × destination × calendar month)
-- ---------------------------------------------------------------------------

create type public.destination_visit_attractiveness as enum (
  'peak',
  'shoulder',
  'off'
);

create table public.destination_seasonality (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  destination_slug text not null,
  destination_name text not null,
  -- 1–12 UTC calendar month for the *stay* period this row describes
  stay_month smallint not null check (stay_month between 1 and 12),
  visit_attractiveness public.destination_visit_attractiveness not null,
  -- Typical booking lead window ahead of stay month start (days)
  booking_lead_min_days integer not null check (booking_lead_min_days >= 0),
  booking_lead_max_days integer not null check (booking_lead_max_days >= booking_lead_min_days),
  notes text,
  evidence jsonb not null default '[]'::jsonb,
  source text not null default 'human' check (source in ('human', 'research_agent', 'seed')),
  last_researched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint destination_seasonality_unique
    unique (organization_id, brand_id, destination_slug, stay_month)
);

create index destination_seasonality_org_brand_idx
  on public.destination_seasonality (organization_id, brand_id);
create index destination_seasonality_slug_idx
  on public.destination_seasonality (brand_id, destination_slug);

alter table public.destination_seasonality enable row level security;

create policy destination_seasonality_select on public.destination_seasonality
  for select using (public.is_org_member(organization_id));
create policy destination_seasonality_write on public.destination_seasonality
  for all using (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  );

create trigger destination_seasonality_set_updated_at
  before update on public.destination_seasonality
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Campaign directives (human steering)
-- ---------------------------------------------------------------------------

create type public.ad_directive_scope as enum (
  'destination',
  'area',
  'hotel',
  'open'
);

create type public.ad_directive_status as enum (
  'active',
  'paused',
  'completed',
  'cancelled'
);

create table public.ad_campaign_directives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  scope public.ad_directive_scope not null,
  title text not null,
  -- Free-text focus e.g. "hotels in Dubai" / "Atlantis The Palm"
  focus_text text not null,
  destination_slug text,
  area_text text,
  hotel_name text,
  budget_share_pct numeric(5, 2) check (
    budget_share_pct is null or (budget_share_pct > 0 and budget_share_pct <= 100)
  ),
  starts_on date,
  ends_on date,
  status public.ad_directive_status not null default 'active',
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  source text not null default 'ui' check (source in ('ui', 'ask_team', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_campaign_directives_org_brand_idx
  on public.ad_campaign_directives (organization_id, brand_id);
create index ad_campaign_directives_status_idx
  on public.ad_campaign_directives (brand_id, status);

alter table public.ad_campaign_directives enable row level security;

create policy ad_campaign_directives_select on public.ad_campaign_directives
  for select using (public.is_org_member(organization_id));
create policy ad_campaign_directives_write on public.ad_campaign_directives
  for all using (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  );

create trigger ad_campaign_directives_set_updated_at
  before update on public.ad_campaign_directives
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Targeting briefs (audience definition + evidence)
-- ---------------------------------------------------------------------------

create table public.ad_targeting_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  directive_id uuid references public.ad_campaign_directives (id) on delete set null,
  media_plan_id uuid references public.ad_media_plans (id) on delete set null,
  campaign_id uuid references public.ad_campaigns (id) on delete set null,
  summary text not null,
  demographics jsonb not null default '{}'::jsonb,
  interests jsonb not null default '[]'::jsonb,
  geos jsonb not null default '[]'::jsonb,
  rationale text not null,
  evidence jsonb not null default '[]'::jsonb,
  seasonality_refs jsonb not null default '[]'::jsonb,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ad_targeting_briefs_org_idx on public.ad_targeting_briefs (organization_id);
create index ad_targeting_briefs_campaign_idx on public.ad_targeting_briefs (campaign_id);

alter table public.ad_targeting_briefs enable row level security;

create policy ad_targeting_briefs_select on public.ad_targeting_briefs
  for select using (public.is_org_member(organization_id));
create policy ad_targeting_briefs_write on public.ad_targeting_briefs
  for all using (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  );

create trigger ad_targeting_briefs_set_updated_at
  before update on public.ad_targeting_briefs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Launch review board
-- ---------------------------------------------------------------------------

create type public.ad_launch_review_department as enum (
  'compliance',
  'finance',
  'brand',
  'research',
  'qa'
);

create type public.ad_launch_review_status as enum (
  'pending',
  'in_progress',
  'passed',
  'failed'
);

create type public.ad_launch_signoff_result as enum (
  'pass',
  'fail',
  'pending'
);

create table public.ad_launch_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  status public.ad_launch_review_status not null default 'pending',
  all_passed boolean not null default false,
  cmo_approved_at timestamptz,
  cmo_approved_by uuid references auth.users (id) on delete set null,
  cmo_note text,
  -- AI CMO auto-approval when autonomy allows
  cmo_agent_run_id uuid references public.agent_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_launch_reviews_campaign_unique unique (campaign_id)
);

create table public.ad_launch_review_signoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  review_id uuid not null references public.ad_launch_reviews (id) on delete cascade,
  department public.ad_launch_review_department not null,
  result public.ad_launch_signoff_result not null default 'pending',
  notes text,
  findings jsonb not null default '[]'::jsonb,
  agent_name text,
  agent_run_id uuid references public.agent_runs (id) on delete set null,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_launch_review_signoffs_unique unique (review_id, department)
);

create index ad_launch_reviews_org_idx on public.ad_launch_reviews (organization_id);
create index ad_launch_review_signoffs_review_idx on public.ad_launch_review_signoffs (review_id);

alter table public.ad_launch_reviews enable row level security;
alter table public.ad_launch_review_signoffs enable row level security;

create policy ad_launch_reviews_select on public.ad_launch_reviews
  for select using (public.is_org_member(organization_id));
create policy ad_launch_reviews_write on public.ad_launch_reviews
  for all using (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  );

create policy ad_launch_review_signoffs_select on public.ad_launch_review_signoffs
  for select using (public.is_org_member(organization_id));
create policy ad_launch_review_signoffs_write on public.ad_launch_review_signoffs
  for all using (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  );

create trigger ad_launch_reviews_set_updated_at
  before update on public.ad_launch_reviews
  for each row execute function public.set_updated_at();
create trigger ad_launch_review_signoffs_set_updated_at
  before update on public.ad_launch_review_signoffs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Campaign pipeline links
-- ---------------------------------------------------------------------------

alter table public.ad_campaigns
  add column if not exists directive_id uuid references public.ad_campaign_directives (id) on delete set null,
  add column if not exists targeting_brief_id uuid references public.ad_targeting_briefs (id) on delete set null,
  add column if not exists launch_review_id uuid references public.ad_launch_reviews (id) on delete set null,
  add column if not exists optimization_goal text,
  add column if not exists setup_blockers jsonb not null default '[]'::jsonb;

create index if not exists ad_campaigns_directive_idx on public.ad_campaigns (directive_id);

alter table public.ad_media_plans
  add column if not exists directive_id uuid references public.ad_campaign_directives (id) on delete set null,
  add column if not exists selection_evidence jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Standing setup blockers (org/brand) — Meta Pixel, etc.
-- ---------------------------------------------------------------------------

create table public.ads_setup_blockers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  code text not null,
  title text not null,
  body text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  blocks_conversion_optimisation boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ads_setup_blockers_unique unique (organization_id, brand_id, code)
);

create index ads_setup_blockers_brand_idx on public.ads_setup_blockers (brand_id);

alter table public.ads_setup_blockers enable row level security;

create policy ads_setup_blockers_select on public.ads_setup_blockers
  for select using (public.is_org_member(organization_id));
create policy ads_setup_blockers_write on public.ads_setup_blockers
  for all using (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  )
  with check (
    public.has_org_role(organization_id, array['org_owner', 'org_admin', 'org_member']::public.org_member_role[])
  );

create trigger ads_setup_blockers_set_updated_at
  before update on public.ads_setup_blockers
  for each row execute function public.set_updated_at();
