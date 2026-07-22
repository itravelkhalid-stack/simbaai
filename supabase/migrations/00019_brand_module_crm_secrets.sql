-- Brand module completion: visual identity, products, CRM per-org webhook secrets

alter table public.brands
  add column if not exists logo_url text,
  add column if not exists primary_color text,
  add column if not exists secondary_color text,
  add column if not exists accent_color text,
  add column if not exists font_heading text,
  add column if not exists font_body text,
  add column if not exists tagline text,
  add column if not exists products_summary text;

create table public.brand_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brand_id uuid not null references public.brands (id) on delete cascade,
  name text not null,
  description text,
  category text,
  price_pence integer,
  currency text not null default 'GBP',
  url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_products_org_idx on public.brand_products (organization_id);
create index brand_products_brand_idx on public.brand_products (brand_id, sort_order);

create trigger brand_products_set_updated_at
  before update on public.brand_products
  for each row execute function public.set_updated_at();

alter table public.brand_products enable row level security;

create policy brand_products_select on public.brand_products for select to authenticated
  using (public.is_org_member(organization_id));
create policy brand_products_insert on public.brand_products for insert to authenticated
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy brand_products_update on public.brand_products for update to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin','org_member']::public.org_member_role[]));
create policy brand_products_delete on public.brand_products for delete to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));

-- Per-org CRM webhook secrets (HMAC)
create table public.org_webhook_secrets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('shopify', 'woocommerce', 'forms', 'generic')),
  secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create index org_webhook_secrets_org_idx on public.org_webhook_secrets (organization_id);

create trigger org_webhook_secrets_set_updated_at
  before update on public.org_webhook_secrets
  for each row execute function public.set_updated_at();

alter table public.org_webhook_secrets enable row level security;

create policy org_webhook_secrets_select on public.org_webhook_secrets for select to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));
create policy org_webhook_secrets_write on public.org_webhook_secrets for all to authenticated
  using (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]))
  with check (public.has_org_role(organization_id, array['org_owner','org_admin']::public.org_member_role[]));
