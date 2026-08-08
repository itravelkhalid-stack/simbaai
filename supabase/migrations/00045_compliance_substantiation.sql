-- Approved claims + terms/disclaimer URLs for claim substantiation.
alter table public.compliance_profiles
  add column if not exists approved_claims text[] not null default '{}'::text[],
  add column if not exists terms_urls text[] not null default '{}'::text[];

comment on column public.compliance_profiles.approved_claims is
  'Pre-cleared claim wording the brand may use without unsubstantiated-claim flags.';
comment on column public.compliance_profiles.terms_urls is
  'Canonical T&Cs / disclaimer landing URLs for substantiation and required linking.';
