-- Safe treasury compatibility columns for XML, SII-only and manual payables.
-- Idempotent production migration: no drops, no data reset.

alter table if exists public.accounts_payable
  add column if not exists source_type text not null default 'xml',
  add column if not exists xml_status text not null default 'received',
  add column if not exists is_payable_without_xml boolean not null default false,
  add column if not exists sii_purchase_registry_id uuid references public.sii_purchase_registry(id) on delete set null,
  add column if not exists dte_document_id uuid references public.dte_documents(id) on delete set null,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists included_in_batch_at timestamptz,
  add column if not exists due_date_estimated boolean not null default false;

create index if not exists accounts_payable_source_type_idx
  on public.accounts_payable(source_type);

create index if not exists accounts_payable_xml_status_idx
  on public.accounts_payable(xml_status);

create index if not exists accounts_payable_payment_status_idx
  on public.accounts_payable(payment_status);

create index if not exists accounts_payable_sii_purchase_registry_id_idx
  on public.accounts_payable(sii_purchase_registry_id);

create index if not exists accounts_payable_dte_document_id_idx
  on public.accounts_payable(dte_document_id);

create index if not exists accounts_payable_tenant_payment_status_idx
  on public.accounts_payable(tenant_id, payment_status);

create index if not exists accounts_payable_tenant_source_xml_idx
  on public.accounts_payable(tenant_id, source_type, xml_status);
