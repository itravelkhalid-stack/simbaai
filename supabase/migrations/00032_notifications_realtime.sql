-- Enable Realtime for in-app notification bell (postgres_changes).
-- Safe to re-run: ignore if already a member of the publication.

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
  when undefined_object then
    -- publication may not exist in non-Supabase environments
    raise notice 'supabase_realtime publication missing; skipped';
end $$;

-- Ensure REPLICA IDENTITY FULL so UPDATE payloads include old/new for filters
alter table public.notifications replica identity full;
