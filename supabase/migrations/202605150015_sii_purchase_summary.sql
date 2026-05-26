create table if not exists public.sii_purchase_summary (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  periodo text not null,
  rut_empresa text not null,
  tipo_documento text not null,
  cantidad_documentos_sii integer not null default 0,
  monto_neto_sii numeric(14, 4) not null default 0,
  iva_sii numeric(14, 4) not null default 0,
  monto_total_sii numeric(14, 4) not null default 0,
  source_file text,
  source_hash text,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, periodo, rut_empresa, tipo_documento)
);

create index if not exists sii_purchase_summary_tenant_period_idx on public.sii_purchase_summary(tenant_id, periodo);
create index if not exists sii_purchase_summary_type_idx on public.sii_purchase_summary(tenant_id, tipo_documento);

drop trigger if exists sii_purchase_summary_set_updated_at on public.sii_purchase_summary;
create trigger sii_purchase_summary_set_updated_at
before update on public.sii_purchase_summary
for each row execute function public.set_updated_at();

alter table public.sii_purchase_summary enable row level security;

drop policy if exists "members can read sii purchase summary" on public.sii_purchase_summary;
create policy "members can read sii purchase summary"
on public.sii_purchase_summary for select
using (public.is_tenant_member(tenant_id));

drop policy if exists "finance can manage sii purchase summary" on public.sii_purchase_summary;
create policy "finance can manage sii purchase summary"
on public.sii_purchase_summary for all
using (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']))
with check (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']));
