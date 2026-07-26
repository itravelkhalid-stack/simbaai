-- Phase E: annual review meeting type + typed executable meeting actions

alter type public.meeting_type add value 'annual_review';

create type public.meeting_typed_action as enum (
  'pause_campaign',
  'shift_budget',
  'change_content_mix',
  'flag_risk',
  'note'
);

create type public.meeting_action_execution as enum (
  'pending',
  'executed',
  'queued_approval',
  'skipped',
  'failed'
);

alter table public.meeting_actions
  add column if not exists action_type public.meeting_typed_action not null default 'note',
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists execution_status public.meeting_action_execution not null default 'pending',
  add column if not exists execution_result text;

alter table public.meetings
  add column if not exists escalation_flagged boolean not null default false,
  add column if not exists actions_taken jsonb not null default '[]'::jsonb,
  add column if not exists actions_awaiting_approval jsonb not null default '[]'::jsonb;

comment on column public.meetings.escalation_flagged is
  'Set when weekly marketing finds a KPI >25% off target for 2 consecutive weeks.';
comment on column public.meetings.actions_taken is
  'Autonomous meeting actions that executed after authorizeAgentAction.';
comment on column public.meetings.actions_awaiting_approval is
  'Meeting actions queued for human approval / recommendations feed.';
