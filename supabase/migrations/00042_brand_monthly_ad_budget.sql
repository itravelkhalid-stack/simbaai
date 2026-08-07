-- Per-brand monthly ad budget: the ONE human-set ads control for budget-only autonomy.

alter table public.brands
  add column if not exists monthly_ad_budget_pence integer
    check (monthly_ad_budget_pence is null or monthly_ad_budget_pence >= 0);

alter table public.brands
  add column if not exists monthly_ad_budget_currency text not null default 'GBP';

comment on column public.brands.monthly_ad_budget_pence is
  'Human-set monthly ad budget (minor units). Agents derive platform split and daily pacing; still capped by org_ad_limits.';

comment on column public.brands.monthly_ad_budget_currency is
  'Currency for monthly_ad_budget_pence (ISO code).';
