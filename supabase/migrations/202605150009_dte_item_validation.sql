-- DTE item validation and raw emitter/receiver audit fields.

alter table public.dte_documents
  add column if not exists raw_emitter_json jsonb,
  add column if not exists raw_receiver_json jsonb,
  add column if not exists parser_version text not null default 'dte-parser-v2',
  add column if not exists parser_warnings jsonb not null default '[]'::jsonb,
  add column if not exists parser_errors jsonb not null default '[]'::jsonb;

alter table public.dte_items
  add column if not exists item_name_normalized text,
  add column if not exists item_description_raw text,
  add column if not exists item_validation_status text not null default 'unchecked',
  add column if not exists item_validation_errors jsonb not null default '[]'::jsonb,
  add column if not exists price_confidence_score numeric(5, 2) not null default 0;

create index if not exists dte_items_name_normalized_idx on public.dte_items(tenant_id, item_name_normalized);
create index if not exists dte_items_validation_status_idx on public.dte_items(tenant_id, item_validation_status);
