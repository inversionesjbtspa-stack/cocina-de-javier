-- Production hardening for complete DTE parsing, validation and product traceability.

alter table public.dte_documents
  add column if not exists validation_warnings jsonb not null default '[]'::jsonb,
  add column if not exists validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists confidence_score numeric(5, 2) not null default 0;

alter table public.dte_items
  add column if not exists item_name_raw text,
  add column if not exists item_gross_total numeric(14, 4),
  add column if not exists item_additional_tax_codes text[] not null default '{}'::text[];

create index if not exists dte_items_product_idx on public.dte_items(product_id);
create index if not exists dte_items_name_raw_idx on public.dte_items(tenant_id, item_name_raw);
