-- Meeting generation retry tracking (one automatic retry after failure)

alter table public.meetings
  add column if not exists generation_attempts integer not null default 0;

comment on column public.meetings.generation_attempts is
  'How many generation attempts have completed (success or failure). Soft-fail retries once before permanent failed.';
