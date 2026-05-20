-- Complete DTE XML pipeline: Gmail metadata, complete parsed payloads, sync runs and processing errors.

alter table public.dte_documents
  add column if not exists fecha_vencimiento date,
  add column if not exists forma_pago text,
  add column if not exists term_pago_glosa text,
  add column if not exists mnt_bruto numeric(14, 4),
  add column if not exists tpo_tran_compra text,
  add column if not exists tpo_tran_venta text,
  add column if not exists giro_emisor text,
  add column if not exists acteco text,
  add column if not exists dir_origen text,
  add column if not exists cmna_origen text,
  add column if not exists ciudad_origen text,
  add column if not exists cdg_sii_sucur text,
  add column if not exists giro_receptor text,
  add column if not exists dir_receptor text,
  add column if not exists cmna_receptor text,
  add column if not exists ciudad_receptor text,
  add column if not exists tasa_iva numeric(8, 4),
  add column if not exists iva_uso_comun numeric(14, 4),
  add column if not exists monto_periodo numeric(14, 4),
  add column if not exists vlr_pagar numeric(14, 4),
  add column if not exists raw_json jsonb not null default '{}'::jsonb,
  add column if not exists ted_json jsonb,
  add column if not exists caf_json jsonb,
  add column if not exists frmt text,
  add column if not exists xml_original text,
  add column if not exists source_provider text not null default 'gmail',
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text,
  add column if not exists gmail_attachment_id text,
  add column if not exists gmail_filename text,
  add column if not exists gmail_received_at timestamptz,
  add column if not exists gmail_sender text,
  add column if not exists gmail_subject text,
  add column if not exists validation_status text not null default 'parsed';

alter table public.dte_items
  add column if not exists item_code text,
  add column if not exists code_type text,
  add column if not exists code_value text,
  add column if not exists name text,
  add column if not exists detail_description text,
  add column if not exists discount_pct numeric(8, 4),
  add column if not exists surcharge_pct numeric(8, 4),
  add column if not exists surcharge_amount numeric(14, 4) not null default 0,
  add column if not exists additional_tax_code text,
  add column if not exists raw_json jsonb not null default '{}'::jsonb;

alter table public.dte_references
  add column if not exists line_number integer,
  add column if not exists reference_code text,
  add column if not exists raw_json jsonb not null default '{}'::jsonb;

create table if not exists public.dte_taxes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  dte_item_id uuid references public.dte_items(id) on delete cascade,
  tipo_imp text,
  tasa_imp numeric(8, 4),
  monto_imp numeric(14, 4) not null default 0,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dte_global_discounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dte_document_id uuid not null references public.dte_documents(id) on delete cascade,
  line_number integer,
  movement_type text,
  description text,
  value_type text,
  value numeric(14, 4),
  other_currency_value numeric(14, 4),
  exempt_indicator text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dte_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  provider text not null default 'gmail',
  query text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  messages_found integer not null default 0,
  attachments_found integer not null default 0,
  processed_count integer not null default 0,
  new_count integer not null default 0,
  duplicate_count integer not null default 0,
  rejected_count integer not null default 0,
  error_count integer not null default 0,
  next_sync_hint timestamptz,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dte_processing_errors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  sync_run_id uuid references public.dte_sync_runs(id) on delete cascade,
  gmail_message_id text,
  gmail_thread_id text,
  gmail_attachment_id text,
  filename text,
  error_code text not null,
  message text not null,
  raw_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dte_documents_folio_idx on public.dte_documents(folio);
create index if not exists dte_documents_rut_emisor_idx on public.dte_documents(rut_emisor);
create index if not exists dte_documents_tipo_fecha_idx on public.dte_documents(tipo_dte, fecha_emision desc);
create index if not exists dte_documents_sha256_idx on public.dte_documents(xml_sha256);
create index if not exists dte_documents_gmail_message_idx on public.dte_documents(gmail_message_id);
create index if not exists dte_documents_idempotency_idx on public.dte_documents(idempotency_key);
create index if not exists dte_taxes_document_idx on public.dte_taxes(dte_document_id);
create index if not exists dte_global_discounts_document_idx on public.dte_global_discounts(dte_document_id);
create index if not exists dte_sync_runs_started_idx on public.dte_sync_runs(started_at desc);
create index if not exists dte_processing_errors_run_idx on public.dte_processing_errors(sync_run_id);

alter table public.dte_taxes enable row level security;
alter table public.dte_global_discounts enable row level security;
alter table public.dte_sync_runs enable row level security;
alter table public.dte_processing_errors enable row level security;

drop policy if exists "members can read dte taxes" on public.dte_taxes;
create policy "members can read dte taxes"
on public.dte_taxes for select
to authenticated
using (public.current_user_is_member(tenant_id));

drop policy if exists "accounting can manage dte taxes" on public.dte_taxes;
create policy "accounting can manage dte taxes"
on public.dte_taxes for all
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

drop policy if exists "members can read dte global discounts" on public.dte_global_discounts;
create policy "members can read dte global discounts"
on public.dte_global_discounts for select
to authenticated
using (public.current_user_is_member(tenant_id));

drop policy if exists "accounting can manage dte global discounts" on public.dte_global_discounts;
create policy "accounting can manage dte global discounts"
on public.dte_global_discounts for all
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

drop policy if exists "members can read dte sync runs" on public.dte_sync_runs;
create policy "members can read dte sync runs"
on public.dte_sync_runs for select
to authenticated
using (tenant_id is null or public.current_user_is_member(tenant_id));

drop policy if exists "members can read dte processing errors" on public.dte_processing_errors;
create policy "members can read dte processing errors"
on public.dte_processing_errors for select
to authenticated
using (tenant_id is null or public.current_user_is_member(tenant_id));
