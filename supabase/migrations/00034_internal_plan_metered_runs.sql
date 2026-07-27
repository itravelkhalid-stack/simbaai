-- Internal plan tier + metered agent_runs for AI quota
-- Plans: free | starter | growth | agency | internal (not Stripe-purchasable)
--
-- NOTE: enum ADD VALUE may need to commit before use on some Postgres
-- versions. apply-migrations runs each file in its own transaction; if
-- the org update fails on a fresh ADD, re-run or apply 00035 separately.

do $$ begin
  alter type public.org_plan add value 'internal';
exception
  when duplicate_object then null;
end $$;
