-- Safe payment beneficiary catalog and supplier assignment links.

create table if not exists public.payment_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  rut text not null check (rut ~ '^[0-9]+-[0-9kK]$'),
  bank_name text not null,
  bank_code text not null,
  account_type text not null,
  account_number text not null,
  payment_email text,
  observation text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rut, bank_code, account_number)
);

create table if not exists public.supplier_payment_beneficiary_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  payment_beneficiary_id uuid not null references public.payment_beneficiaries(id) on delete restrict,
  reason text,
  is_active boolean not null default true,
  assigned_by uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  removed_by uuid references public.profiles(id) on delete set null,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists supplier_payment_beneficiary_one_active_idx
  on public.supplier_payment_beneficiary_links(tenant_id, supplier_id)
  where is_active;

create index if not exists payment_beneficiaries_tenant_status_idx
  on public.payment_beneficiaries(tenant_id, status);

create index if not exists payment_beneficiaries_tenant_rut_idx
  on public.payment_beneficiaries(tenant_id, rut);

create index if not exists supplier_payment_beneficiary_supplier_idx
  on public.supplier_payment_beneficiary_links(tenant_id, supplier_id);

create index if not exists supplier_payment_beneficiary_beneficiary_idx
  on public.supplier_payment_beneficiary_links(payment_beneficiary_id);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'payment_beneficiaries_set_updated_at'
      and tgrelid = 'public.payment_beneficiaries'::regclass
  ) then
    create trigger payment_beneficiaries_set_updated_at
    before update on public.payment_beneficiaries
    for each row execute function public.set_updated_at();
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'supplier_payment_beneficiary_links_set_updated_at'
      and tgrelid = 'public.supplier_payment_beneficiary_links'::regclass
  ) then
    create trigger supplier_payment_beneficiary_links_set_updated_at
    before update on public.supplier_payment_beneficiary_links
    for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.payment_beneficiaries enable row level security;
alter table public.supplier_payment_beneficiary_links enable row level security;

grant select, insert, update on public.payment_beneficiaries to authenticated;
grant select, insert, update on public.supplier_payment_beneficiary_links to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_beneficiaries'
      and policyname = 'finance and procurement can read payment beneficiaries'
  ) then
    create policy "finance and procurement can read payment beneficiaries"
    on public.payment_beneficiaries for select
    to authenticated
    using (
      public.current_user_has_role(
        tenant_id,
        array['owner', 'admin', 'finance_manager', 'accountant', 'procurement_manager']::public.app_role[]
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_beneficiaries'
      and policyname = 'finance and procurement can write payment beneficiaries'
  ) then
    create policy "finance and procurement can write payment beneficiaries"
    on public.payment_beneficiaries for all
    to authenticated
    using (
      public.current_user_has_role(
        tenant_id,
        array['owner', 'admin', 'finance_manager', 'procurement_manager']::public.app_role[]
      )
    )
    with check (
      public.current_user_has_role(
        tenant_id,
        array['owner', 'admin', 'finance_manager', 'procurement_manager']::public.app_role[]
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_payment_beneficiary_links'
      and policyname = 'finance and procurement can read beneficiary links'
  ) then
    create policy "finance and procurement can read beneficiary links"
    on public.supplier_payment_beneficiary_links for select
    to authenticated
    using (
      public.current_user_has_role(
        tenant_id,
        array['owner', 'admin', 'finance_manager', 'accountant', 'procurement_manager']::public.app_role[]
      )
    );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_payment_beneficiary_links'
      and policyname = 'finance and procurement can write beneficiary links'
  ) then
    create policy "finance and procurement can write beneficiary links"
    on public.supplier_payment_beneficiary_links for all
    to authenticated
    using (
      public.current_user_has_role(
        tenant_id,
        array['owner', 'admin', 'finance_manager', 'procurement_manager']::public.app_role[]
      )
    )
    with check (
      public.current_user_has_role(
        tenant_id,
        array['owner', 'admin', 'finance_manager', 'procurement_manager']::public.app_role[]
      )
    );
  end if;
end $$;
