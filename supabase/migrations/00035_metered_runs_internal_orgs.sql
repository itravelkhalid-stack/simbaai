-- Metered agent_runs + assign internal plan to platform orgs
-- Depends on 00034 adding org_plan value 'internal'

alter table public.agent_runs
  add column if not exists metered boolean not null default true;

comment on column public.agent_runs.metered is
  'When true, non-failed runs count toward organizations.ai_runs_month. System jobs (tagging, publishers, cron digests) set false.';

create index if not exists agent_runs_org_metered_created_idx
  on public.agent_runs (organization_id, created_at)
  where metered = true and status <> 'failed';

update public.agent_runs
set metered = false
where agent_name in (
  'media_vision_tag',
  'social_publisher',
  'email_sender',
  'organic_growth',
  'ads_optimisation',
  'ads_optimisation_agent',
  'seo_weekly_summary',
  'pipeline_review',
  'finance_analyst',
  'integration_health'
);

update public.organizations
set plan = 'internal'
where lower(slug) in ('simba', 'simba-ai', 'simbaai', 'simba-ai-ltd')
   or lower(name) in ('simba', 'simba ai', 'simbaai');
