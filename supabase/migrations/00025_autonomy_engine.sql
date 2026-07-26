-- Phase D: per-brand autonomy operating mode + agent kill switch

create type public.brand_autonomy_mode as enum ('approval', 'autonomous');

alter table public.brands
  add column autonomy_mode public.brand_autonomy_mode not null default 'approval',
  add column channel_modes jsonb not null default '{}'::jsonb,
  add column agent_activity_paused boolean not null default false;

comment on column public.brands.autonomy_mode is
  'approval = every outbound agent action queues for humans; autonomous = agents may execute within limits.';
comment on column public.brands.channel_modes is
  'Optional per-channel overrides, e.g. {"organic_social":"autonomous","ads":"approval","email":"approval"}.';
comment on column public.brands.agent_activity_paused is
  'Brand kill switch: halt all autonomous execution and scheduled publishing immediately.';

-- Soft thresholds used by the autonomous optimisation / growth agents
-- (sane defaults when brand_kpis rows are absent).
alter table public.brands
  add column autonomy_min_roas numeric(10, 2) not null default 1.5,
  add column autonomy_max_cpa_pence integer not null default 5000;

comment on column public.brands.autonomy_min_roas is
  'Pause active campaigns below this ROAS in autonomous mode (overridden by brand_kpis.roas when set).';
comment on column public.brands.autonomy_max_cpa_pence is
  'Pause active campaigns above this CPA in autonomous mode (overridden by brand_kpis.cpa when set).';
