create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  rut text not null,
  full_name text not null,
  birth_date date,
  nationality text,
  address text,
  commune text,
  phone text,
  personal_email text,
  work_email text,
  position text,
  area text,
  hire_date date,
  contract_type text not null default 'contratado',
  work_schedule text,
  base_salary numeric(14, 4) not null default 0,
  status text not null default 'activo',
  cost_center text,
  afp text,
  health_system text,
  health_plan text,
  unemployment_insurance boolean not null default true,
  family_allowances integer not null default 0,
  payment_enabled boolean not null default false,
  payment_enabled_at timestamptz,
  payment_enabled_by uuid references auth.users(id) on delete set null,
  payment_disabled_at timestamptz,
  payment_disabled_by uuid references auth.users(id) on delete set null,
  payment_toggle_reason text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, rut)
);

create table if not exists public.hr_employee_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  bank_name text,
  bank_code text,
  account_type text,
  account_number text,
  payment_email text,
  account_holder_name text,
  account_holder_rut text,
  validation_status text not null default 'pending',
  is_primary boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, is_primary)
);

create table if not exists public.hr_payslips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete set null,
  period text not null,
  storage_bucket text not null default 'hr-payslips',
  storage_path text not null,
  original_filename text not null,
  net_amount numeric(14, 4) not null default 0,
  earnings_amount numeric(14, 4) not null default 0,
  deductions_amount numeric(14, 4) not null default 0,
  status text not null default 'cargada',
  source_file text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_id, period)
);

create table if not exists public.hr_vacation_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  initial_balance numeric(8, 2) not null default 0,
  accrued_days numeric(8, 2) not null default 0,
  used_days numeric(8, 2) not null default 0,
  pending_days numeric(8, 2) not null default 0,
  last_calculated_at timestamptz,
  manual_adjustment numeric(8, 2) not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, employee_id)
);

create table if not exists public.hr_vacation_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  business_days numeric(8, 2) not null,
  previous_balance numeric(8, 2) not null default 0,
  resulting_balance numeric(8, 2) not null default 0,
  status text not null default 'solicitada',
  observation text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_vacation_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vacation_request_id uuid not null references public.hr_vacation_requests(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  document_type text not null default 'papeleta',
  storage_bucket text not null default 'hr-vacation-documents',
  storage_path text,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_employee_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  document_type text not null,
  period text,
  storage_bucket text not null default 'hr-employee-documents',
  storage_path text not null,
  original_filename text not null,
  status text not null default 'vigente',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_payment_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  period text not null,
  payment_type text not null,
  amount numeric(14, 4) not null,
  glosa text,
  status text not null default 'borrador',
  scheduled_date date,
  payment_date date,
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_advances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  request_date date not null default current_date,
  requested_amount numeric(14, 4) not null default 0,
  approved_amount numeric(14, 4) not null default 0,
  reason text,
  discount_period text,
  status text not null default 'solicitado',
  observation text,
  payment_item_id uuid references public.hr_payment_items(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_bonuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  bonus_type text not null,
  period text not null,
  amount numeric(14, 4) not null,
  reason text,
  status text not null default 'borrador',
  observation text,
  payment_item_id uuid references public.hr_payment_items(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_payment_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  period text not null,
  payment_type text,
  glosa_global text,
  total_amount numeric(14, 4) not null default 0,
  total_employees integer not null default 0,
  status text not null default 'generada',
  storage_bucket text not null default 'payment-files',
  storage_path text,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_payment_batch_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  batch_id uuid not null references public.hr_payment_batches(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  payment_item_id uuid references public.hr_payment_items(id) on delete set null,
  payment_type text not null,
  amount numeric(14, 4) not null,
  glosa text,
  status text not null default 'incluido_en_nomina',
  created_at timestamptz not null default now()
);

create index if not exists hr_employees_tenant_status_idx on public.hr_employees(tenant_id, status, payment_enabled);
create index if not exists hr_payslips_tenant_period_idx on public.hr_payslips(tenant_id, period);
create index if not exists hr_vacation_requests_tenant_status_idx on public.hr_vacation_requests(tenant_id, status, start_date);
create index if not exists hr_payment_items_tenant_period_idx on public.hr_payment_items(tenant_id, period, status, payment_type);
create index if not exists hr_payment_batches_tenant_period_idx on public.hr_payment_batches(tenant_id, period, status);

drop trigger if exists hr_employees_set_updated_at on public.hr_employees;
create trigger hr_employees_set_updated_at before update on public.hr_employees for each row execute function public.set_updated_at();
drop trigger if exists hr_employee_bank_accounts_set_updated_at on public.hr_employee_bank_accounts;
create trigger hr_employee_bank_accounts_set_updated_at before update on public.hr_employee_bank_accounts for each row execute function public.set_updated_at();
drop trigger if exists hr_payslips_set_updated_at on public.hr_payslips;
create trigger hr_payslips_set_updated_at before update on public.hr_payslips for each row execute function public.set_updated_at();
drop trigger if exists hr_vacation_balances_set_updated_at on public.hr_vacation_balances;
create trigger hr_vacation_balances_set_updated_at before update on public.hr_vacation_balances for each row execute function public.set_updated_at();
drop trigger if exists hr_vacation_requests_set_updated_at on public.hr_vacation_requests;
create trigger hr_vacation_requests_set_updated_at before update on public.hr_vacation_requests for each row execute function public.set_updated_at();
drop trigger if exists hr_employee_documents_set_updated_at on public.hr_employee_documents;
create trigger hr_employee_documents_set_updated_at before update on public.hr_employee_documents for each row execute function public.set_updated_at();
drop trigger if exists hr_payment_items_set_updated_at on public.hr_payment_items;
create trigger hr_payment_items_set_updated_at before update on public.hr_payment_items for each row execute function public.set_updated_at();
drop trigger if exists hr_advances_set_updated_at on public.hr_advances;
create trigger hr_advances_set_updated_at before update on public.hr_advances for each row execute function public.set_updated_at();
drop trigger if exists hr_bonuses_set_updated_at on public.hr_bonuses;
create trigger hr_bonuses_set_updated_at before update on public.hr_bonuses for each row execute function public.set_updated_at();
drop trigger if exists hr_payment_batches_set_updated_at on public.hr_payment_batches;
create trigger hr_payment_batches_set_updated_at before update on public.hr_payment_batches for each row execute function public.set_updated_at();

alter table public.hr_employees enable row level security;
alter table public.hr_employee_bank_accounts enable row level security;
alter table public.hr_payslips enable row level security;
alter table public.hr_vacation_balances enable row level security;
alter table public.hr_vacation_requests enable row level security;
alter table public.hr_vacation_documents enable row level security;
alter table public.hr_employee_documents enable row level security;
alter table public.hr_payment_items enable row level security;
alter table public.hr_advances enable row level security;
alter table public.hr_bonuses enable row level security;
alter table public.hr_payment_batches enable row level security;
alter table public.hr_payment_batch_items enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hr_employees',
    'hr_employee_bank_accounts',
    'hr_payslips',
    'hr_vacation_balances',
    'hr_vacation_requests',
    'hr_vacation_documents',
    'hr_employee_documents',
    'hr_payment_items',
    'hr_advances',
    'hr_bonuses',
    'hr_payment_batches',
    'hr_payment_batch_items'
  ]
  loop
    execute format('drop policy if exists "members can read %s" on public.%I', table_name, table_name);
    execute format('create policy "members can read %s" on public.%I for select to authenticated using (public.current_user_is_member(tenant_id))', table_name, table_name);
    execute format('drop policy if exists "admins can manage %s" on public.%I', table_name, table_name);
    execute format('create policy "admins can manage %s" on public.%I for all to authenticated using (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[])) with check (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[]))', table_name, table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('hr-payslips', 'hr-payslips', false, 20971520, array['application/pdf']::text[]),
  ('hr-vacation-documents', 'hr-vacation-documents', false, 20971520, array['application/pdf']::text[]),
  ('hr-employee-documents', 'hr-employee-documents', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']::text[])
on conflict (id) do nothing;

drop policy if exists "hr members can read hr storage objects" on storage.objects;
create policy "hr members can read hr storage objects"
on storage.objects for select
to authenticated
using (
  bucket_id in ('hr-payslips', 'hr-vacation-documents', 'hr-employee-documents')
  and public.current_user_is_member(public.storage_tenant_id(name))
);

drop policy if exists "hr admins can upload hr storage objects" on storage.objects;
create policy "hr admins can upload hr storage objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('hr-payslips', 'hr-vacation-documents', 'hr-employee-documents')
  and public.current_user_has_role(public.storage_tenant_id(name), array['owner', 'admin', 'finance_manager']::public.app_role[])
);
