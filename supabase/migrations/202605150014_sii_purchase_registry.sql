create table if not exists public.sii_purchase_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  periodo text,
  rut_emisor text not null,
  razon_social text,
  tipo_dte text not null,
  folio text not null,
  fecha_emision date,
  monto_neto numeric(14, 4) not null default 0,
  iva numeric(14, 4) not null default 0,
  monto_total numeric(14, 4) not null default 0,
  estado_xml text not null default 'falta_xml',
  claim_status text not null default 'pendiente',
  xml_received_at timestamptz,
  dte_document_id uuid references public.dte_documents(id) on delete set null,
  gmail_message_id text,
  source_file text,
  source_hash text,
  last_imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rut_emisor, tipo_dte, folio)
);

create index if not exists sii_purchase_registry_tenant_period_idx on public.sii_purchase_registry(tenant_id, periodo);
create index if not exists sii_purchase_registry_status_idx on public.sii_purchase_registry(tenant_id, estado_xml, claim_status);
create index if not exists sii_purchase_registry_dte_document_idx on public.sii_purchase_registry(dte_document_id);

drop trigger if exists sii_purchase_registry_set_updated_at on public.sii_purchase_registry;
create trigger sii_purchase_registry_set_updated_at
before update on public.sii_purchase_registry
for each row execute function public.set_updated_at();

alter table public.sii_purchase_registry enable row level security;

drop policy if exists "members can read sii purchase registry" on public.sii_purchase_registry;
create policy "members can read sii purchase registry"
on public.sii_purchase_registry for select
using (public.is_tenant_member(tenant_id));

drop policy if exists "finance can manage sii purchase registry" on public.sii_purchase_registry;
create policy "finance can manage sii purchase registry"
on public.sii_purchase_registry for all
using (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']))
with check (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']));
