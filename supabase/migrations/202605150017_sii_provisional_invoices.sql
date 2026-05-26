alter table if exists public.sii_purchase_registry
  add column if not exists provisional_dte_document_id uuid references public.dte_documents(id) on delete set null,
  add column if not exists accounts_payable_id uuid references public.accounts_payable(id) on delete set null,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists payable_created_at timestamptz;

alter table if exists public.dte_documents
  add column if not exists source_type text not null default 'xml',
  add column if not exists xml_status text not null default 'received',
  add column if not exists payment_status text not null default 'pending',
  add column if not exists sii_purchase_registry_id uuid references public.sii_purchase_registry(id) on delete set null;

alter table if exists public.accounts_payable
  add column if not exists source_type text not null default 'xml',
  add column if not exists sii_purchase_registry_id uuid references public.sii_purchase_registry(id) on delete set null,
  add column if not exists xml_status text not null default 'received',
  add column if not exists is_payable_without_xml boolean not null default false,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references public.profiles(id) on delete set null,
  add column if not exists due_date_estimated boolean not null default false;

create index if not exists sii_purchase_registry_provisional_dte_idx
  on public.sii_purchase_registry(provisional_dte_document_id);

create index if not exists sii_purchase_registry_accounts_payable_idx
  on public.sii_purchase_registry(accounts_payable_id);

create index if not exists dte_documents_sii_registry_idx
  on public.dte_documents(sii_purchase_registry_id);

create index if not exists dte_documents_source_xml_idx
  on public.dte_documents(tenant_id, source_type, xml_status);

create index if not exists accounts_payable_sii_registry_idx
  on public.accounts_payable(sii_purchase_registry_id);

create index if not exists accounts_payable_source_xml_idx
  on public.accounts_payable(tenant_id, source_type, xml_status);
