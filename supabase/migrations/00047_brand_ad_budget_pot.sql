-- Cross-platform monthly ad budget pot + per-month schedule + platform allocation.
-- monthly_ad_budget_pence on brands remains the default fallback when a month has no schedule row.

create type public.ad_budget_allocation_mode as enum (
  'manual_pct',
  'manual_amount',
  'ai_allocates'
);

comment on column public.brands.monthly_ad_budget_pence is
  'Default monthly TOTAL ad pot across all platforms (minor units). Used when brand_budget_months has no row for a month. Agents may split across platforms; still capped by org_ad_limits.';

alter table public.brands
  add column if not exists ad_budget_allocation_mode public.ad_budget_allocation_mode
    not null default 'ai_allocates';

alter table public.brands
  add column if not exists ad_budget_platform_allocations jsonb
    not null default '[]'::jsonb;

comment on column public.brands.ad_budget_allocation_mode is
  'Default platform allocation mode for months without an override: manual_pct | manual_amount | ai_allocates.';

comment on column public.brands.ad_budget_platform_allocations is
  'Default platform allocation rows: [{platform, pct?, amount_pence?, locked?}]. Manual rows are hard constraints; AI may fill unlocked remainder when mode is ai_allocates.';

create table public.brand_budget_months (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  year_month text not null,
  budget_pence integer not null check (budget_pence >= 0),
  currency text not null default 'GBP',
  allocation_mode public.ad_budget_allocation_mode not null default 'ai_allocates',
  platform_allocations jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_budget_months_ym check (year_month ~ '^\d{4}-\d{2}$'),
  constraint brand_budget_months_brand_ym unique (brand_id, year_month)
);

create index brand_budget_months_org_id_idx
  on public.brand_budget_months (organization_id);
create index brand_budget_months_brand_ym_idx
  on public.brand_budget_months (brand_id, year_month);

create trigger brand_budget_months_set_updated_at
  before update on public.brand_budget_months
  for each row execute function public.set_updated_at();

alter table public.brand_budget_months enable row level security;

create policy brand_budget_months_select on public.brand_budget_months
  for select to authenticated
  using (public.is_org_member(organization_id));

create policy brand_budget_months_write on public.brand_budget_months
  for all to authenticated
  using (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  )
  with check (
    public.has_org_role(
      organization_id,
      array['org_owner', 'org_admin', 'org_member']::public.org_member_role[]
    )
  );
