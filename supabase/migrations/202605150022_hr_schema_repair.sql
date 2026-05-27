create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);

alter table public.hr_employees
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists rut text,
  add column if not exists full_name text,
  add column if not exists birth_date date,
  add column if not exists nationality text,
  add column if not exists address text,
  add column if not exists commune text,
  add column if not exists phone text,
  add column if not exists personal_email text,
  add column if not exists work_email text,
  add column if not exists position text,
  add column if not exists area text,
  add column if not exists hire_date date,
  add column if not exists contract_type text default 'contratado',
  add column if not exists work_schedule text,
  add column if not exists base_salary numeric(14, 4) default 0,
  add column if not exists status text default 'activo',
  add column if not exists cost_center text,
  add column if not exists afp text,
  add column if not exists health_system text,
  add column if not exists health_plan text,
  add column if not exists unemployment_insurance boolean default true,
  add column if not exists family_allowances integer default 0,
  add column if not exists payment_enabled boolean default false,
  add column if not exists payment_enabled_at timestamptz,
  add column if not exists payment_enabled_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_disabled_at timestamptz,
  add column if not exists payment_disabled_by uuid references auth.users(id) on delete set null,
  add column if not exists payment_toggle_reason text,
  add column if not exists notes text,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.hr_employee_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);

alter table public.hr_employee_bank_accounts
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists employee_id uuid references public.hr_employees(id) on delete cascade,
  add column if not exists bank_name text,
  add column if not exists bank_code text,
  add column if not exists account_type text,
  add column if not exists account_number text,
  add column if not exists payment_email text,
  add column if not exists account_holder_name text,
  add column if not exists account_holder_rut text,
  add column if not exists validation_status text default 'pending',
  add column if not exists is_primary boolean default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.hr_payslips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete set null,
  period text not null,
  storage_bucket text not null default 'hr-payslips',
  storage_path text,
  original_filename text,
  net_amount numeric(14, 4) not null default 0,
  earnings_amount numeric(14, 4) not null default 0,
  deductions_amount numeric(14, 4) not null default 0,
  status text not null default 'cargada',
  source_file text,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_payslips
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists employee_id uuid references public.hr_employees(id) on delete set null,
  add column if not exists period text,
  add column if not exists storage_bucket text default 'hr-payslips',
  add column if not exists storage_path text,
  add column if not exists original_filename text,
  add column if not exists net_amount numeric(14, 4) default 0,
  add column if not exists earnings_amount numeric(14, 4) default 0,
  add column if not exists deductions_amount numeric(14, 4) default 0,
  add column if not exists status text default 'cargada',
  add column if not exists source_file text,
  add column if not exists uploaded_by uuid references auth.users(id) on delete set null,
  add column if not exists employee_rut text,
  add column if not exists employee_name text,
  add column if not exists section text,
  add column if not exists position text,
  add column if not exists hire_date date,
  add column if not exists base_salary numeric(14, 4) default 0,
  add column if not exists worked_days numeric(8, 2) default 0,
  add column if not exists total_taxable numeric(14, 4) default 0,
  add column if not exists total_non_taxable numeric(14, 4) default 0,
  add column if not exists total_earnings numeric(14, 4) default 0,
  add column if not exists total_discounts numeric(14, 4) default 0,
  add column if not exists afp text,
  add column if not exists health text,
  add column if not exists advances_amount numeric(14, 4) default 0,
  add column if not exists production_bonus_amount numeric(14, 4) default 0,
  add column if not exists responsibility_bonus_amount numeric(14, 4) default 0,
  add column if not exists compensatory_bonus_amount numeric(14, 4) default 0,
  add column if not exists overtime_amount numeric(14, 4) default 0,
  add column if not exists sunday_surcharge_amount numeric(14, 4) default 0,
  add column if not exists ccaf_discount_amount numeric(14, 4) default 0,
  add column if not exists unique_tax_amount numeric(14, 4) default 0,
  add column if not exists additional_health_amount numeric(14, 4) default 0,
  add column if not exists raw_text text,
  add column if not exists parse_warnings jsonb default '[]'::jsonb,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.hr_vacation_balances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
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
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_vacation_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
  start_date date,
  end_date date,
  business_days numeric(8, 2) not null default 0,
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
  tenant_id uuid references public.tenants(id) on delete cascade,
  vacation_request_id uuid references public.hr_vacation_requests(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
  document_type text not null default 'papeleta',
  storage_bucket text not null default 'hr-vacation-documents',
  storage_path text,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_employee_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
  document_type text,
  period text,
  storage_bucket text not null default 'hr-employee-documents',
  storage_path text,
  original_filename text,
  status text not null default 'vigente',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_payment_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
  period text not null,
  payment_type text not null,
  amount numeric(14, 4) not null default 0,
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
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
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
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
  bonus_type text not null,
  period text not null,
  amount numeric(14, 4) not null default 0,
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
  tenant_id uuid references public.tenants(id) on delete cascade,
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
  tenant_id uuid references public.tenants(id) on delete cascade,
  batch_id uuid references public.hr_payment_batches(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete cascade,
  payment_item_id uuid references public.hr_payment_items(id) on delete set null,
  payment_type text not null,
  amount numeric(14, 4) not null default 0,
  glosa text,
  status text not null default 'incluido_en_nomina',
  created_at timestamptz not null default now()
);

create table if not exists public.hr_salary_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete set null,
  payslip_id uuid references public.hr_payslips(id) on delete cascade,
  period text not null,
  component_type text not null,
  label text not null,
  amount numeric(14, 4) not null default 0,
  quantity numeric(10, 2),
  source text not null default 'payslip_pdf',
  raw_text text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.hr_accountant_data_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete set null,
  period text not null,
  rut text,
  employee_name text,
  full_name text,
  position text,
  base_salary numeric(14, 4) not null default 0,
  worked_days numeric(10, 2) not null default 0,
  absences numeric(10, 2) not null default 0,
  overtime_hours numeric(10, 2) not null default 0,
  advances numeric(14, 4) not null default 0,
  advances_amount numeric(14, 4) not null default 0,
  compensatory_bonus numeric(14, 4) not null default 0,
  compensatory_bonus_amount numeric(14, 4) not null default 0,
  aguinaldo numeric(14, 4) not null default 0,
  aguinaldo_amount numeric(14, 4) not null default 0,
  other_bonus numeric(14, 4) not null default 0,
  taxable_amount numeric(14, 4) not null default 0,
  non_taxable_amount numeric(14, 4) not null default 0,
  discounts numeric(14, 4) not null default 0,
  net_pay numeric(14, 4) not null default 0,
  notes text,
  source_file text,
  sheet_name text,
  row_number integer,
  cost_center text,
  licenses numeric(10, 2) not null default 0,
  reason text,
  production_bonus_amount numeric(14, 4) not null default 0,
  sunday_surcharge_amount numeric(14, 4) not null default 0,
  responsibility_bonus_amount numeric(14, 4) not null default 0,
  movilization_amount numeric(14, 4) not null default 0,
  phone_allowance_amount numeric(14, 4) not null default 0,
  cash_allowance_amount numeric(14, 4) not null default 0,
  company_loan_amount numeric(14, 4) not null default 0,
  ccaf_loan_amount numeric(14, 4) not null default 0,
  observations text,
  raw_row jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_accountant_data_rows
  add column if not exists tenant_id uuid references public.tenants(id) on delete cascade,
  add column if not exists employee_id uuid references public.hr_employees(id) on delete set null,
  add column if not exists period text,
  add column if not exists rut text,
  add column if not exists employee_name text,
  add column if not exists full_name text,
  add column if not exists position text,
  add column if not exists base_salary numeric(14, 4) default 0,
  add column if not exists worked_days numeric(10, 2) default 0,
  add column if not exists absences numeric(10, 2) default 0,
  add column if not exists overtime_hours numeric(10, 2) default 0,
  add column if not exists advances numeric(14, 4) default 0,
  add column if not exists advances_amount numeric(14, 4) default 0,
  add column if not exists compensatory_bonus numeric(14, 4) default 0,
  add column if not exists compensatory_bonus_amount numeric(14, 4) default 0,
  add column if not exists aguinaldo numeric(14, 4) default 0,
  add column if not exists aguinaldo_amount numeric(14, 4) default 0,
  add column if not exists other_bonus numeric(14, 4) default 0,
  add column if not exists taxable_amount numeric(14, 4) default 0,
  add column if not exists non_taxable_amount numeric(14, 4) default 0,
  add column if not exists discounts numeric(14, 4) default 0,
  add column if not exists net_pay numeric(14, 4) default 0,
  add column if not exists notes text,
  add column if not exists source_file text,
  add column if not exists sheet_name text,
  add column if not exists row_number integer,
  add column if not exists cost_center text,
  add column if not exists licenses numeric(10, 2) default 0,
  add column if not exists reason text,
  add column if not exists production_bonus_amount numeric(14, 4) default 0,
  add column if not exists sunday_surcharge_amount numeric(14, 4) default 0,
  add column if not exists responsibility_bonus_amount numeric(14, 4) default 0,
  add column if not exists movilization_amount numeric(14, 4) default 0,
  add column if not exists phone_allowance_amount numeric(14, 4) default 0,
  add column if not exists cash_allowance_amount numeric(14, 4) default 0,
  add column if not exists company_loan_amount numeric(14, 4) default 0,
  add column if not exists ccaf_loan_amount numeric(14, 4) default 0,
  add column if not exists observations text,
  add column if not exists raw_row jsonb default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists hr_employees_tenant_rut_uidx on public.hr_employees(tenant_id, rut);
create unique index if not exists hr_employee_bank_accounts_primary_uidx on public.hr_employee_bank_accounts(employee_id, is_primary);
create unique index if not exists hr_payslips_tenant_employee_period_uidx on public.hr_payslips(tenant_id, employee_id, period);
create unique index if not exists hr_vacation_balances_tenant_employee_uidx on public.hr_vacation_balances(tenant_id, employee_id);
create unique index if not exists hr_accountant_data_rows_tenant_period_rut_sheet_uidx on public.hr_accountant_data_rows(tenant_id, period, rut, sheet_name);
create unique index if not exists hr_salary_components_tenant_employee_period_component_uidx on public.hr_salary_components(tenant_id, employee_id, period, component_type, label, source);

create index if not exists hr_employees_tenant_status_idx on public.hr_employees(tenant_id, status, payment_enabled);
create index if not exists hr_payslips_tenant_period_idx on public.hr_payslips(tenant_id, period);
create index if not exists hr_vacation_requests_tenant_status_idx on public.hr_vacation_requests(tenant_id, status, start_date);
create index if not exists hr_payment_items_tenant_period_idx on public.hr_payment_items(tenant_id, period, status, payment_type);
create index if not exists hr_payment_batches_tenant_period_idx on public.hr_payment_batches(tenant_id, period, status);
create index if not exists hr_salary_components_tenant_period_idx on public.hr_salary_components(tenant_id, period, component_type);
create index if not exists hr_accountant_data_rows_tenant_period_idx on public.hr_accountant_data_rows(tenant_id, period, rut);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant select, insert, update, delete on table
  public.hr_employees,
  public.hr_employee_bank_accounts,
  public.hr_payslips,
  public.hr_vacation_balances,
  public.hr_vacation_requests,
  public.hr_vacation_documents,
  public.hr_employee_documents,
  public.hr_payment_items,
  public.hr_advances,
  public.hr_bonuses,
  public.hr_payment_batches,
  public.hr_payment_batch_items,
  public.hr_salary_components,
  public.hr_accountant_data_rows
to authenticated;

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
alter table public.hr_salary_components enable row level security;
alter table public.hr_accountant_data_rows enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
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
    'hr_payment_batch_items',
    'hr_salary_components',
    'hr_accountant_data_rows'
  ]
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'members can read ' || target_table
    ) then
      execute format('create policy "members can read %s" on public.%I for select to authenticated using (public.current_user_is_member(tenant_id))', target_table, target_table);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = target_table
        and policyname = 'admins can manage ' || target_table
    ) then
      execute format('create policy "admins can manage %s" on public.%I for all to authenticated using (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[])) with check (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[]))', target_table, target_table);
    end if;
  end loop;
end $$;

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'hr_employees',
    'hr_employee_bank_accounts',
    'hr_payslips',
    'hr_vacation_balances',
    'hr_vacation_requests',
    'hr_employee_documents',
    'hr_payment_items',
    'hr_advances',
    'hr_bonuses',
    'hr_payment_batches',
    'hr_accountant_data_rows'
  ]
  loop
    trigger_name := target_table || '_set_updated_at';
    if not exists (select 1 from pg_trigger where tgname = trigger_name) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', trigger_name, target_table);
    end if;
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('hr-payslips', 'hr-payslips', false, 20971520, array['application/pdf']::text[]),
  ('hr-vacation-documents', 'hr-vacation-documents', false, 20971520, array['application/pdf']::text[]),
  ('hr-employee-documents', 'hr-employee-documents', false, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv']::text[])
on conflict (id) do nothing;
