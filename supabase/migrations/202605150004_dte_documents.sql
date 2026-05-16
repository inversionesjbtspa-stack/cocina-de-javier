-- DTE documents: XML ingestion, validation results and rendered PDFs.

create type public.dte_document_status as enum (
  'received',
  'parsed',
  'validated',
  'matched',
  'rejected',
  'archived'
);

create type public.dte_validation_status as enum (
  'pending',
  'passed',
  'failed',
  'warning'
);

create table public.dte_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  goods_receipt_id uuid references public.goods_receipts(id) on delete set null,
  tipo_dte text not null,
  folio text not null,
  rut_emisor text not null check (rut_emisor ~ '^[0-9]+-[0-9kK]$'),
  rut_receptor text not null check (rut_receptor ~ '^[0-9]+-[0-9kK]$'),
  razon_social_emisor text,
  razon_social_receptor text,
  fecha_emision date not null,
  fecha_recepcion timestamptz not null default now(),
  monto_neto numeric(14, 4) not null default 0 check (monto_neto >= 0),
  monto_exento numeric(14, 4) not null default 0 check (monto_exento >= 0),
  iva numeric(14, 4) not null default 0 check (iva >= 0),
  monto_total numeric(14, 4) not null check (monto_total >= 0),
  currency text not null default 'CLP' check (currency ~ '^[A-Z]{3}$'),
  status public.dte_document_status not null default 'received',
  sii_status text,
  xml_sha256 text not null,
  idempotency_key text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rut_emisor, tipo_dte, folio),
  unique (tenant_id, idempotency_key)
);

create table public.dte_xml_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  storage_bucket text not null default 'dte-xml-originals',
  storage_path text not null,
  content_type text not null default 'application/xml',
  sha256 text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create table public.dte_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  product_id uuid references public.products(id) on delete set null,
  description text not null,
  quantity numeric(14, 4) not null default 1 check (quantity > 0),
  unit text not null default 'unidad',
  unit_price numeric(14, 4) not null default 0 check (unit_price >= 0),
  discount_amount numeric(14, 4) not null default 0 check (discount_amount >= 0),
  line_total numeric(14, 4) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now(),
  unique (dte_document_id, line_number)
);

create table public.dte_references (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  referenced_tipo_dte text,
  referenced_folio text,
  reference_date date,
  reason text,
  created_at timestamptz not null default now()
);

create table public.dte_validation_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  validator_code text not null,
  status public.dte_validation_status not null default 'pending',
  message text,
  details jsonb,
  validated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.dte_pdf_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  storage_bucket text not null default 'dte-pdf-rendered',
  storage_path text not null,
  sha256 text,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

create index dte_documents_tenant_status_idx on public.dte_documents(tenant_id, status);
create index dte_documents_supplier_idx on public.dte_documents(supplier_id);
create index dte_documents_purchase_order_idx on public.dte_documents(purchase_order_id);
create index dte_xml_files_document_idx on public.dte_xml_files(dte_document_id);
create index dte_items_document_idx on public.dte_items(dte_document_id);
create index dte_validation_results_document_idx on public.dte_validation_results(dte_document_id);
create index dte_pdf_files_document_idx on public.dte_pdf_files(dte_document_id);

create trigger dte_documents_set_updated_at
before update on public.dte_documents
for each row execute function public.set_updated_at();

alter table public.dte_documents enable row level security;
alter table public.dte_xml_files enable row level security;
alter table public.dte_items enable row level security;
alter table public.dte_references enable row level security;
alter table public.dte_validation_results enable row level security;
alter table public.dte_pdf_files enable row level security;

create policy "members can read dte documents"
on public.dte_documents for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "accounting can manage dte documents"
on public.dte_documents for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
);

create policy "members can read dte xml files"
on public.dte_xml_files for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "accounting can manage dte xml files"
on public.dte_xml_files for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
);

create policy "members can read dte items"
on public.dte_items for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "accounting can manage dte items"
on public.dte_items for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
);

create policy "members can read dte references"
on public.dte_references for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "accounting can manage dte references"
on public.dte_references for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
);

create policy "members can read dte validation results"
on public.dte_validation_results for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "accounting can manage dte validation results"
on public.dte_validation_results for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
);

create policy "members can read dte pdf files"
on public.dte_pdf_files for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "accounting can manage dte pdf files"
on public.dte_pdf_files for all
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
)
with check (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant']::public.app_role[]
  )
);
