-- RLS coverage audit: tables with RLS off or zero policies
-- Run in Supabase SQL editor or: psql $DATABASE_URL -f scripts/audit-rls.sql

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  coalesce(
    (select count(*)::int
     from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname),
    0
  ) as policy_count,
  case
    when not c.relrowsecurity then 'RLS_DISABLED'
    when not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
    ) then 'NO_POLICIES'
    else 'OK'
  end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname not like 'pg_%'
order by
  case
    when not c.relrowsecurity then 0
    when not exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = c.relname
    ) then 1
    else 2
  end,
  c.relname;
