-- Security foundation for Cocina de Javier ERP.
-- Supabase Auth owns auth.users; application identity lives in public.profiles.

create extension if not exists "pgcrypto";

create type public.app_role as enum (
  'owner',
  'admin',
  'finance_manager',
  'accountant',
  'procurement_manager',
  'buyer',
  'store_manager',
  'auditor'
);

create type public.membership_status as enum (
  'active',
  'invited',
  'suspended'
);

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  legal_name text not null,
  trade_name text,
  rut text not null,
  giro text,
  address text,
  sii_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rut)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  phone text,
  default_tenant_id uuid references public.tenants(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role public.app_role not null,
  permission_code text not null references public.permissions(code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role, permission_code)
);

create table public.user_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.app_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, company_id, branch_id, user_id, role)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role,
  event_type text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now()
);

create table public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  scope text not null,
  request_hash text not null,
  response_payload jsonb,
  locked_until timestamptz,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, scope, key)
);

create index user_memberships_user_id_idx on public.user_memberships(user_id);
create index user_memberships_tenant_id_idx on public.user_memberships(tenant_id);
create index user_memberships_company_id_idx on public.user_memberships(company_id);
create index audit_events_tenant_created_idx on public.audit_events(tenant_id, created_at desc);
create index idempotency_keys_tenant_scope_idx on public.idempotency_keys(tenant_id, scope);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger user_memberships_set_updated_at
before update on public.user_memberships
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_user_has_role(
  target_tenant_id uuid,
  allowed_roles public.app_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_memberships membership
    where membership.user_id = auth.uid()
      and membership.tenant_id = target_tenant_id
      and membership.status = 'active'
      and membership.role = any(allowed_roles)
  );
$$;

create or replace function public.current_user_is_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_memberships membership
    where membership.user_id = auth.uid()
      and membership.tenant_id = target_tenant_id
      and membership.status = 'active'
  );
$$;

alter table public.tenants enable row level security;
alter table public.companies enable row level security;
alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_memberships enable row level security;
alter table public.audit_events enable row level security;
alter table public.idempotency_keys enable row level security;

create policy "members can read tenants"
on public.tenants for select
to authenticated
using (public.current_user_is_member(id));

create policy "owners and admins can update tenants"
on public.tenants for update
to authenticated
using (public.current_user_has_role(id, array['owner', 'admin']::public.app_role[]))
with check (public.current_user_has_role(id, array['owner', 'admin']::public.app_role[]));

create policy "members can read companies"
on public.companies for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "owners and admins can manage companies"
on public.companies for all
to authenticated
using (public.current_user_has_role(tenant_id, array['owner', 'admin']::public.app_role[]))
with check (public.current_user_has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

create policy "members can read branches"
on public.branches for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "owners and admins can manage branches"
on public.branches for all
to authenticated
using (public.current_user_has_role(tenant_id, array['owner', 'admin']::public.app_role[]))
with check (public.current_user_has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

create policy "users can read their profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy "users can update their profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "members can read peer profiles"
on public.profiles for select
to authenticated
using (
  exists (
    select 1
    from public.user_memberships viewer
    join public.user_memberships peer on peer.tenant_id = viewer.tenant_id
    where viewer.user_id = auth.uid()
      and viewer.status = 'active'
      and peer.status = 'active'
      and peer.user_id = profiles.id
  )
);

create policy "authenticated users can read permissions"
on public.permissions for select
to authenticated
using (true);

create policy "authenticated users can read role permissions"
on public.role_permissions for select
to authenticated
using (true);

create policy "members can read memberships"
on public.user_memberships for select
to authenticated
using (public.current_user_is_member(tenant_id));

create policy "owners and admins can manage memberships"
on public.user_memberships for all
to authenticated
using (public.current_user_has_role(tenant_id, array['owner', 'admin']::public.app_role[]))
with check (public.current_user_has_role(tenant_id, array['owner', 'admin']::public.app_role[]));

create policy "members can read audit events"
on public.audit_events for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'auditor']::public.app_role[]
  )
);

create policy "service role can insert audit events"
on public.audit_events for insert
to service_role
with check (true);

create policy "members can read idempotency keys"
on public.idempotency_keys for select
to authenticated
using (
  public.current_user_has_role(
    tenant_id,
    array['owner', 'admin', 'finance_manager', 'accountant', 'procurement_manager']::public.app_role[]
  )
);

create policy "service role can manage idempotency keys"
on public.idempotency_keys for all
to service_role
using (true)
with check (true);

insert into public.permissions (code, description)
values
  ('dashboard.read', 'Ver dashboard ejecutivo'),
  ('suppliers.manage', 'Administrar proveedores'),
  ('products.manage', 'Administrar productos'),
  ('purchases.manage', 'Administrar compras'),
  ('dte.manage', 'Cargar y validar facturas DTE'),
  ('accounts_payable.manage', 'Administrar cuentas por pagar'),
  ('payments.approve', 'Aprobar pagos'),
  ('payments.generate_file', 'Generar archivos bancarios'),
  ('reports.export', 'Exportar reportes'),
  ('users.manage', 'Administrar usuarios y permisos'),
  ('audit.read', 'Leer auditoria')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code)
values
  ('owner', 'dashboard.read'),
  ('owner', 'suppliers.manage'),
  ('owner', 'products.manage'),
  ('owner', 'purchases.manage'),
  ('owner', 'dte.manage'),
  ('owner', 'accounts_payable.manage'),
  ('owner', 'payments.approve'),
  ('owner', 'payments.generate_file'),
  ('owner', 'reports.export'),
  ('owner', 'users.manage'),
  ('owner', 'audit.read'),
  ('admin', 'dashboard.read'),
  ('admin', 'suppliers.manage'),
  ('admin', 'products.manage'),
  ('admin', 'purchases.manage'),
  ('admin', 'dte.manage'),
  ('admin', 'accounts_payable.manage'),
  ('admin', 'reports.export'),
  ('admin', 'users.manage'),
  ('admin', 'audit.read'),
  ('finance_manager', 'dashboard.read'),
  ('finance_manager', 'accounts_payable.manage'),
  ('finance_manager', 'payments.approve'),
  ('finance_manager', 'payments.generate_file'),
  ('finance_manager', 'reports.export'),
  ('accountant', 'dashboard.read'),
  ('accountant', 'dte.manage'),
  ('accountant', 'accounts_payable.manage'),
  ('accountant', 'reports.export'),
  ('procurement_manager', 'dashboard.read'),
  ('procurement_manager', 'suppliers.manage'),
  ('procurement_manager', 'products.manage'),
  ('procurement_manager', 'purchases.manage'),
  ('buyer', 'dashboard.read'),
  ('buyer', 'purchases.manage'),
  ('store_manager', 'dashboard.read'),
  ('store_manager', 'purchases.manage'),
  ('auditor', 'dashboard.read'),
  ('auditor', 'reports.export'),
  ('auditor', 'audit.read')
on conflict (role, permission_code) do nothing;
