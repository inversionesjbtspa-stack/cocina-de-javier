-- Control SII vs XML - SQL consolidado idempotente para Supabase SQL Editor.
-- Seguro para produccion: no borra datos, no usa DROP, y puede ejecutarse mas de una vez.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sii_purchase_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  periodo text,
  rut_emisor text not null,
  proveedor text,
  razon_social text,
  tipo_dte text not null,
  folio text not null,
  fecha_emision date,
  monto_neto numeric(14, 4) not null default 0,
  iva numeric(14, 4) not null default 0,
  monto_total numeric(14, 4) not null default 0,
  estado_xml text not null default 'falta_xml',
  claim_status text not null default 'pendiente',
  dte_document_id uuid references public.dte_documents(id) on delete set null,
  xml_received_at timestamptz,
  gmail_message_id text,
  source_file text,
  source_hash text,
  last_imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sii_purchase_registry
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists periodo text,
  add column if not exists rut_emisor text,
  add column if not exists proveedor text,
  add column if not exists razon_social text,
  add column if not exists tipo_dte text,
  add column if not exists folio text,
  add column if not exists fecha_emision date,
  add column if not exists monto_neto numeric(14, 4) not null default 0,
  add column if not exists iva numeric(14, 4) not null default 0,
  add column if not exists monto_total numeric(14, 4) not null default 0,
  add column if not exists estado_xml text not null default 'falta_xml',
  add column if not exists claim_status text not null default 'pendiente',
  add column if not exists dte_document_id uuid references public.dte_documents(id) on delete set null,
  add column if not exists xml_received_at timestamptz,
  add column if not exists gmail_message_id text,
  add column if not exists source_file text,
  add column if not exists source_hash text,
  add column if not exists last_imported_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.sii_purchase_registry
set proveedor = razon_social
where proveedor is null and razon_social is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sii_purchase_registry_tenant_rut_tipo_folio_key'
      and conrelid = 'public.sii_purchase_registry'::regclass
  ) then
    alter table public.sii_purchase_registry
      add constraint sii_purchase_registry_tenant_rut_tipo_folio_key
      unique (tenant_id, rut_emisor, tipo_dte, folio);
  end if;
end $$;

create index if not exists sii_purchase_registry_tenant_period_idx
  on public.sii_purchase_registry(tenant_id, periodo);

create index if not exists sii_purchase_registry_status_idx
  on public.sii_purchase_registry(tenant_id, estado_xml, claim_status);

create index if not exists sii_purchase_registry_dte_document_idx
  on public.sii_purchase_registry(dte_document_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'sii_purchase_registry_set_updated_at'
      and tgrelid = 'public.sii_purchase_registry'::regclass
  ) then
    create trigger sii_purchase_registry_set_updated_at
    before update on public.sii_purchase_registry
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.sii_purchase_registry enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sii_purchase_registry'
      and policyname = 'members can read sii purchase registry'
  ) then
    create policy "members can read sii purchase registry"
    on public.sii_purchase_registry for select
    using (public.is_tenant_member(tenant_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sii_purchase_registry'
      and policyname = 'finance can manage sii purchase registry'
  ) then
    create policy "finance can manage sii purchase registry"
    on public.sii_purchase_registry for all
    using (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']))
    with check (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']));
  end if;
end $$;

grant select, insert, update, delete on table public.sii_purchase_registry to authenticated;
grant select, insert, update, delete on table public.sii_purchase_registry to service_role;

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
  updated_at timestamptz not null default now()
);

alter table public.sii_purchase_summary
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists periodo text,
  add column if not exists rut_empresa text,
  add column if not exists tipo_documento text,
  add column if not exists cantidad_documentos_sii integer not null default 0,
  add column if not exists monto_neto_sii numeric(14, 4) not null default 0,
  add column if not exists iva_sii numeric(14, 4) not null default 0,
  add column if not exists monto_total_sii numeric(14, 4) not null default 0,
  add column if not exists source_file text,
  add column if not exists source_hash text,
  add column if not exists imported_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sii_purchase_summary_tenant_period_rut_tipo_key'
      and conrelid = 'public.sii_purchase_summary'::regclass
  ) then
    alter table public.sii_purchase_summary
      add constraint sii_purchase_summary_tenant_period_rut_tipo_key
      unique (tenant_id, periodo, rut_empresa, tipo_documento);
  end if;
end $$;

create index if not exists sii_purchase_summary_tenant_period_idx
  on public.sii_purchase_summary(tenant_id, periodo);

create index if not exists sii_purchase_summary_type_idx
  on public.sii_purchase_summary(tenant_id, tipo_documento);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'sii_purchase_summary_set_updated_at'
      and tgrelid = 'public.sii_purchase_summary'::regclass
  ) then
    create trigger sii_purchase_summary_set_updated_at
    before update on public.sii_purchase_summary
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.sii_purchase_summary enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sii_purchase_summary'
      and policyname = 'members can read sii purchase summary'
  ) then
    create policy "members can read sii purchase summary"
    on public.sii_purchase_summary for select
    using (public.is_tenant_member(tenant_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sii_purchase_summary'
      and policyname = 'finance can manage sii purchase summary'
  ) then
    create policy "finance can manage sii purchase summary"
    on public.sii_purchase_summary for all
    using (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']))
    with check (public.has_any_role(tenant_id, array['owner','admin','finance_manager','accountant']));
  end if;
end $$;

grant select, insert, update, delete on table public.sii_purchase_summary to authenticated;
grant select, insert, update, delete on table public.sii_purchase_summary to service_role;

notify pgrst, 'reload schema';
