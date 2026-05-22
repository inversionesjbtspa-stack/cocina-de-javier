-- Editable supplier payment profile fields for operational treasury.

alter table public.suppliers
  add column if not exists commune text,
  add column if not exists city text,
  add column if not exists commercial_email text,
  add column if not exists payment_email text,
  add column if not exists payment_terms_label text,
  add column if not exists observations text,
  add column if not exists profile_source text not null default 'xml',
  add column if not exists profile_manual_updated_at timestamptz;

alter table public.supplier_bank_accounts
  add column if not exists bank_code text;

create index if not exists suppliers_profile_status_idx on public.suppliers(tenant_id, status);
create index if not exists supplier_bank_accounts_bank_code_idx on public.supplier_bank_accounts(tenant_id, bank_code);
