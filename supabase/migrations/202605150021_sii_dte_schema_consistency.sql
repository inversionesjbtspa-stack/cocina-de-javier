-- SII/XML/Treasury schema consistency.
-- Safe, idempotent migration. No drops, no data reset.

alter table if exists public.dte_documents
  add column if not exists source_type text not null default 'xml',
  add column if not exists xml_status text not null default 'received',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists sii_purchase_registry_id uuid references public.sii_purchase_registry(id) on delete set null;

alter table if exists public.sii_purchase_registry
  add column if not exists payment_status text not null default 'pending',
  add column if not exists accounts_payable_id uuid references public.accounts_payable(id) on delete set null,
  add column if not exists provisional_dte_document_id uuid references public.dte_documents(id) on delete set null,
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists payable_created_at timestamptz;

create index if not exists dte_documents_source_type_idx
  on public.dte_documents(source_type);

create index if not exists dte_documents_payment_status_idx
  on public.dte_documents(payment_status);

create index if not exists dte_documents_sii_purchase_registry_id_idx
  on public.dte_documents(sii_purchase_registry_id);

create index if not exists dte_documents_tenant_source_xml_idx
  on public.dte_documents(tenant_id, source_type, xml_status);

create index if not exists sii_purchase_registry_payment_status_idx
  on public.sii_purchase_registry(payment_status);

create index if not exists sii_purchase_registry_accounts_payable_id_idx
  on public.sii_purchase_registry(accounts_payable_id);

create index if not exists sii_purchase_registry_provisional_dte_document_id_idx
  on public.sii_purchase_registry(provisional_dte_document_id);

create index if not exists sii_purchase_registry_tenant_payment_status_idx
  on public.sii_purchase_registry(tenant_id, payment_status);
