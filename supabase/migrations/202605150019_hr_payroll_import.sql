alter table public.hr_payslips
  add column if not exists employee_rut text,
  add column if not exists employee_name text,
  add column if not exists section text,
  add column if not exists position text,
  add column if not exists hire_date date,
  add column if not exists base_salary numeric(14, 4) not null default 0,
  add column if not exists worked_days numeric(8, 2) not null default 0,
  add column if not exists total_taxable numeric(14, 4) not null default 0,
  add column if not exists total_non_taxable numeric(14, 4) not null default 0,
  add column if not exists total_earnings numeric(14, 4) not null default 0,
  add column if not exists total_discounts numeric(14, 4) not null default 0,
  add column if not exists afp text,
  add column if not exists health text,
  add column if not exists advances_amount numeric(14, 4) not null default 0,
  add column if not exists production_bonus_amount numeric(14, 4) not null default 0,
  add column if not exists responsibility_bonus_amount numeric(14, 4) not null default 0,
  add column if not exists compensatory_bonus_amount numeric(14, 4) not null default 0,
  add column if not exists overtime_amount numeric(14, 4) not null default 0,
  add column if not exists sunday_surcharge_amount numeric(14, 4) not null default 0,
  add column if not exists ccaf_discount_amount numeric(14, 4) not null default 0,
  add column if not exists unique_tax_amount numeric(14, 4) not null default 0,
  add column if not exists additional_health_amount numeric(14, 4) not null default 0,
  add column if not exists raw_text text,
  add column if not exists parse_warnings jsonb not null default '[]'::jsonb;

create table if not exists public.hr_salary_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
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
  created_at timestamptz not null default now(),
  unique (tenant_id, employee_id, period, component_type, label, source)
);

create table if not exists public.hr_accountant_data_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete set null,
  period text not null,
  source_file text,
  sheet_name text,
  row_number integer,
  rut text not null,
  full_name text not null,
  cost_center text,
  absences numeric(10, 2) not null default 0,
  licenses numeric(10, 2) not null default 0,
  reason text,
  overtime_hours numeric(10, 2) not null default 0,
  aguinaldo_amount numeric(14, 4) not null default 0,
  production_bonus_amount numeric(14, 4) not null default 0,
  compensatory_bonus_amount numeric(14, 4) not null default 0,
  sunday_surcharge_amount numeric(14, 4) not null default 0,
  responsibility_bonus_amount numeric(14, 4) not null default 0,
  movilization_amount numeric(14, 4) not null default 0,
  phone_allowance_amount numeric(14, 4) not null default 0,
  cash_allowance_amount numeric(14, 4) not null default 0,
  advances_amount numeric(14, 4) not null default 0,
  company_loan_amount numeric(14, 4) not null default 0,
  ccaf_loan_amount numeric(14, 4) not null default 0,
  observations text,
  raw_row jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period, rut, sheet_name)
);

create index if not exists hr_salary_components_tenant_period_idx on public.hr_salary_components(tenant_id, period, component_type);
create index if not exists hr_accountant_data_rows_tenant_period_idx on public.hr_accountant_data_rows(tenant_id, period, rut);

drop trigger if exists hr_accountant_data_rows_set_updated_at on public.hr_accountant_data_rows;
create trigger hr_accountant_data_rows_set_updated_at before update on public.hr_accountant_data_rows for each row execute function public.set_updated_at();

alter table public.hr_salary_components enable row level security;
alter table public.hr_accountant_data_rows enable row level security;

drop policy if exists "members can read hr_salary_components" on public.hr_salary_components;
create policy "members can read hr_salary_components" on public.hr_salary_components for select to authenticated using (public.current_user_is_member(tenant_id));
drop policy if exists "admins can manage hr_salary_components" on public.hr_salary_components;
create policy "admins can manage hr_salary_components" on public.hr_salary_components for all to authenticated using (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[])) with check (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]));

drop policy if exists "members can read hr_accountant_data_rows" on public.hr_accountant_data_rows;
create policy "members can read hr_accountant_data_rows" on public.hr_accountant_data_rows for select to authenticated using (public.current_user_is_member(tenant_id));
drop policy if exists "admins can manage hr_accountant_data_rows" on public.hr_accountant_data_rows;
create policy "admins can manage hr_accountant_data_rows" on public.hr_accountant_data_rows for all to authenticated using (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[])) with check (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]));
