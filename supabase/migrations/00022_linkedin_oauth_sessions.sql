-- Allow LinkedIn company Page picker sessions (reuse social_oauth_sessions)

alter table public.social_oauth_sessions
  drop constraint if exists social_oauth_sessions_platform_check;

alter table public.social_oauth_sessions
  add constraint social_oauth_sessions_platform_check
  check (platform in ('facebook', 'instagram', 'linkedin'));
