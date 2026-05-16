-- Administrative core: suppliers, products and cloud storage policies.

create type public.supplier_status as enum (
  'draft',
  'active',
  'blocked',
  'archived'
);

create type public.bank_account_status as enum (
  'pending_validation',
  'validated',
  'rejected',
  'disabled'
);

create type public.product_status as enum (
  'active',
  'inactive',
  'archived'
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  rut text not null check (rut ~ '^[0-9]+-[0-9kK]$'),
  legal_name text not null,
  trade_name text,
  giro text,
  email text,
  phone text,
  address text,
  category text,
  payment_terms_days integer not null default 30 check (payment_terms_days >= 0),
  status public.supplier_status not null default 'draft',
  risk_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rut)
);

create table public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supplier_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  bank_name text not null,
  account_type text not null,
  account_number text not null,
  account_holder_name text not null,
  account_holder_rut text not null check (account_holder_rut ~ '^[0-9]+-[0-9kK]$'),
  status public.bank_account_status not null default 'pending_validation',
  validated_by uuid references public.profiles(id) on delete set null,
  validated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.supplier_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  document_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  sha256 text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  parent_id uuid references public.product_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  sku text check (sku is null or length(trim(sku)) > 0),
  name text not null,
  description text,
  unit text not null default 'unidad',
  status public.product_status not null default 'active',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, sku),
  unique (tenant_id, name)
);

create table public.product_supplier_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_product_code text,
  preferred boolean not null default false,
  last_purchase_price numeric(14, 4),
  last_purchase_currency text not null default 'CLP' check (last_purchase_currency ~ '^[A-Z]{3}$'),
  last_purchase_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, product_id, supplier_id)
);

create table public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  source_entity_type text not null,
  source_entity_id uuid,
  price numeric(14, 4) not null check (price >= 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  effective_date date not null,
  captured_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index suppliers_tenant_status_idx on public.suppliers(tenant_id, status);
create index supplier_contacts_supplier_idx on public.supplier_contacts(supplier_id);
create index supplier_bank_accounts_supplier_idx on public.supplier_bank_accounts(supplier_id);
create index supplier_documents_supplier_idx on public.supplier_documents(supplier_id);
create index product_categories_tenant_idx on public.product_categories(tenant_id);
create index products_tenant_status_idx on public.products(tenant_id, status);
create index product_supplier_links_product_idx on public.product_supplier_links(product_id);
create index product_price_history_product_date_idx on public.product_price_history(product_id, effective_date desc);

create trigger suppliers_set_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

create trigger supplier_contacts_set_updated_at
before update on public.supplier_contacts
for each row execute function public.set_updated_at();

create trigger supplier_bank_accounts_set_updated_at
before update on public.supplier_bank_accounts
for each row execute function public.set_updated_at();

create trigger product_categories_set_updated_at
before update on public.product_categories
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger product_supplier_links_set_updated_at
before update on public.product_supplier_links
for each row execute function public.set_updated_at();

alter table public.suppliers enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.supplier_bank_accounts enable row level security;
alter table public.supplier_documents enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_supplier_links enable row level security;
alter table public.product_price_history enable row level security;

create policy "members can read suppliers"
on public.suppliers for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "supplier managers can write suppliers"
on public.suppliers for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read supplier contacts"
on public.supplier_contacts for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "supplier managers can write supplier contacts"
on public.supplier_contacts for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "finance and procurement can read supplier bank accounts"
on public.supplier_bank_accounts for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant', 'procurement_manager']::public.app_role[]
  )
);

create policy "admins and procurement can write supplier bank accounts"
on public.supplier_bank_accounts for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read supplier documents"
on public.supplier_documents for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "supplier managers can write supplier documents"
on public.supplier_documents for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read product categories"
on public.product_categories for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "product managers can write product categories"
on public.product_categories for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read products"
on public.products for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "product managers can write products"
on public.products for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read product supplier links"
on public.product_supplier_links for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "product managers can write product supplier links"
on public.product_supplier_links for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager']::public.app_role[]
  )
);

create policy "members can read product price history"
on public.product_price_history for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "product managers can write product price history"
on public.product_price_history for insert
to authenticated
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'procurement_manager', 'accountant']::public.app_role[]
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'dte-xml-originals',
    'dte-xml-originals',
    false,
    10485760,
    array['application/xml', 'text/xml']::text[]
  ),
  (
    'dte-pdf-rendered',
    'dte-pdf-rendered',
    false,
    20971520,
    array['application/pdf']::text[]
  ),
  (
    'purchase-attachments',
    'purchase-attachments',
    false,
    20971520,
    array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']::text[]
  ),
  (
    'payment-files',
    'payment-files',
    false,
    10485760,
    array['text/plain', 'text/csv', 'application/octet-stream']::text[]
  ),
  (
    'report-exports',
    'report-exports',
    false,
    52428800,
    array['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']::text[]
  )
on conflict (id) do nothing;

create or replace function public.storage_tenant_id(object_name text)
returns uuid
language plpgsql
stable
as $$
declare
  tenant_folder text;
begin
  tenant_folder := (storage.foldername(object_name))[1];

  if tenant_folder is null then
    return null;
  end if;

  return tenant_folder::uuid;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create policy "members can read tenant storage objects"
on storage.objects for select
to authenticated
using (
  bucket_id in (
    'dte-xml-originals',
    'dte-pdf-rendered',
    'purchase-attachments',
    'report-exports'
  )
  and public.current_user_is_member(public.storage_tenant_id(name))
);

create policy "authorized users can upload tenant documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id in (
    'dte-xml-originals',
    'dte-pdf-rendered',
    'purchase-attachments',
    'report-exports'
  )
  and public.current_user_has_role(
    public.storage_tenant_id(name),
    array['owner', 'admin', 'finance_manager', 'accountant', 'procurement_manager']::public.app_role[]
  )
);

create policy "finance can read payment files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'payment-files'
  and public.current_user_has_role(
    public.storage_tenant_id(name),
    array['owner', 'admin', 'finance_manager']::public.app_role[]
  )
);

create policy "finance can upload payment files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-files'
  and public.current_user_has_role(
    public.storage_tenant_id(name),
    array['owner', 'admin', 'finance_manager']::public.app_role[]
  )
);
