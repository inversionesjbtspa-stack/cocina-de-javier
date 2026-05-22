-- Treasury bank normalization and Santander validation traceability.

create table if not exists public.bank_mappings (
  id uuid primary key default gen_random_uuid(),
  raw_pattern text not null unique,
  bank_name_normalized text not null,
  bank_code text,
  confidence numeric(5, 4) not null default 0 check (confidence >= 0 and confidence <= 1),
  needs_review boolean not null default false,
  source text not null default 'master proveedores jesus',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.supplier_bank_accounts
  add column if not exists bank_raw text,
  add column if not exists bank_name_normalized text,
  add column if not exists bank_mapping_confidence numeric(5, 4),
  add column if not exists bank_mapping_needs_review boolean not null default false;

alter table public.accounts_payable
  add column if not exists payment_validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists payment_validation_checked_at timestamptz;

create index if not exists supplier_bank_accounts_mapping_review_idx
on public.supplier_bank_accounts(tenant_id, bank_mapping_needs_review);

create index if not exists accounts_payable_payment_validation_idx
on public.accounts_payable(tenant_id, payment_validation_checked_at desc);

insert into public.bank_mappings (raw_pattern, bank_name_normalized, bank_code, confidence, needs_review, source)
values
  ('BANCO DE CREDITO E INVERSIONES - NOVA BCI', 'BCI', '16', 1, false, 'master proveedores jesus'),
  ('BANCO DE CREDITO E INVERSIONES', 'BCI', '16', 0.98, false, 'master proveedores jesus'),
  ('BCI', 'BCI', '16', 1, false, 'master proveedores jesus'),
  ('NOVA BCI', 'BCI', '16', 1, false, 'master proveedores jesus'),
  ('BANCO DE A EDWARDS', 'BANCO DE CHILE / EDWARDS', '1', 1, false, 'master proveedores jesus'),
  ('BANCO EDWARDS', 'BANCO DE CHILE / EDWARDS', '1', 0.98, false, 'master proveedores jesus'),
  ('BANCO DE CHILE', 'BANCO DE CHILE / EDWARDS', '1', 0.96, false, 'master proveedores jesus alias'),
  ('BANCO SANTANDER CHILE', 'BANCO SANTANDER CHILE', '37', 1, false, 'master proveedores jesus'),
  ('BANCO SANTANDER', 'BANCO SANTANDER CHILE', '37', 0.98, false, 'master proveedores jesus'),
  ('SANTANDER', 'BANCO SANTANDER CHILE', '37', 0.98, false, 'master proveedores jesus'),
  ('THE FIRST NAT BANK OF BOSTON ITAU', 'ITAU', '39', 1, false, 'master proveedores jesus'),
  ('THE FIRST NAT BANK OF BOSTON', 'ITAU', '39', 0.98, false, 'master proveedores jesus'),
  ('ITAU', 'ITAU', '39', 1, false, 'master proveedores jesus'),
  ('BANCO ESTADO', 'BANCO ESTADO', '12', 0.98, false, 'master proveedores jesus alias'),
  ('BANCO DEL ESTADO', 'BANCO ESTADO', '12', 0.98, false, 'master proveedores jesus alias'),
  ('BANCO DEL ESTADO DE CHILE', 'BANCO ESTADO', '12', 1, false, 'master proveedores jesus'),
  ('SCOTIABANK', 'SCOTIABANK', '14', 0.98, false, 'master proveedores jesus alias'),
  ('BANCO SCOTIABANK SUDAMERICANO', 'SCOTIABANK', '14', 1, false, 'master proveedores jesus'),
  ('BANCO SECURITY', 'BANCO SECURITY', '49', 1, false, 'master proveedores jesus'),
  ('BANCO BICE', 'BANCO BICE', '28', 1, false, 'master proveedores jesus'),
  ('BANCO FALABELLA', 'BANCO FALABELLA', '51', 1, false, 'master proveedores jesus'),
  ('BANCO RIPLEY', 'BANCO RIPLEY', '53', 1, false, 'master proveedores jesus'),
  ('BANCO INTERNACIONAL', 'BANCO INTERNACIONAL', '9', 1, false, 'master proveedores jesus'),
  ('MERCADO PAGO', 'MERCADO PAGO', '875', 0.98, false, 'master proveedores jesus alias'),
  ('MERCADOPAGO', 'MERCADO PAGO', '875', 1, false, 'master proveedores jesus'),
  ('BANCO CONSORCIO', 'BANCO CONSORCIO', null, 0.5, true, 'needs master/template confirmation'),
  ('COOPEUCH', 'COOPEUCH', null, 0.5, true, 'needs master/template confirmation'),
  ('TENPO', 'TENPO', null, 0.5, true, 'needs master/template confirmation')
on conflict (raw_pattern) do update set
  bank_name_normalized = excluded.bank_name_normalized,
  bank_code = excluded.bank_code,
  confidence = excluded.confidence,
  needs_review = excluded.needs_review,
  source = excluded.source,
  updated_at = now();

with normalized_accounts as (
  select
    account.id,
    account.bank_name as original_bank_name,
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(upper(account.bank_name), '\[OBJECT OBJECT\]', ' ', 'g'),
            '//', ' ', 'g'
          ),
          '[().]', ' ', 'g'
        ),
        '\s*-\s*', ' - ', 'g'
      ),
      '\s+', ' ', 'g'
    )) as clean_bank_name
  from public.supplier_bank_accounts account
  where account.bank_name is not null
)
update public.supplier_bank_accounts account
set
  bank_raw = coalesce(account.bank_raw, normalized.original_bank_name),
  bank_name = mapping.bank_name_normalized,
  bank_name_normalized = mapping.bank_name_normalized,
  bank_code = coalesce(nullif(account.bank_code, ''), mapping.bank_code),
  bank_mapping_confidence = mapping.confidence,
  bank_mapping_needs_review = mapping.needs_review or coalesce(nullif(account.bank_code, ''), mapping.bank_code) is null
from normalized_accounts normalized
join public.bank_mappings mapping on mapping.raw_pattern = normalized.clean_bank_name
where account.id = normalized.id;
