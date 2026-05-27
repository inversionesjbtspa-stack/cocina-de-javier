alter table public.hr_employees
  add column if not exists glosa_tef text;

alter table public.hr_employee_bank_accounts
  add column if not exists glosa_tef text,
  add column if not exists source_file text,
  add column if not exists imported_at timestamptz;

alter table public.hr_accountant_data_rows
  add column if not exists row_number integer,
  add column if not exists sheet_name text,
  add column if not exists full_name text,
  add column if not exists employee_name text,
  add column if not exists rut text,
  add column if not exists cost_center text,
  add column if not exists absences numeric(10, 2) default 0,
  add column if not exists licenses numeric(10, 2) default 0,
  add column if not exists reason text,
  add column if not exists overtime_hours numeric(10, 2) default 0,
  add column if not exists advances numeric(14, 4) default 0,
  add column if not exists advances_amount numeric(14, 4) default 0,
  add column if not exists aguinaldo numeric(14, 4) default 0,
  add column if not exists aguinaldo_amount numeric(14, 4) default 0,
  add column if not exists compensatory_bonus numeric(14, 4) default 0,
  add column if not exists compensatory_bonus_amount numeric(14, 4) default 0,
  add column if not exists production_bonus_amount numeric(14, 4) default 0,
  add column if not exists sunday_surcharge_amount numeric(14, 4) default 0,
  add column if not exists responsibility_bonus_amount numeric(14, 4) default 0,
  add column if not exists movilization_amount numeric(14, 4) default 0,
  add column if not exists phone_allowance_amount numeric(14, 4) default 0,
  add column if not exists cash_allowance_amount numeric(14, 4) default 0,
  add column if not exists company_loan_amount numeric(14, 4) default 0,
  add column if not exists ccaf_loan_amount numeric(14, 4) default 0,
  add column if not exists observations text,
  add column if not exists notes text,
  add column if not exists raw_row jsonb default '{}'::jsonb,
  add column if not exists source_file text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz default now();

create index if not exists hr_employee_bank_accounts_glosa_tef_idx
on public.hr_employee_bank_accounts(tenant_id, glosa_tef);

create index if not exists hr_employees_glosa_tef_idx
on public.hr_employees(tenant_id, glosa_tef);

create index if not exists hr_accountant_data_rows_row_number_idx
on public.hr_accountant_data_rows(tenant_id, period, row_number);

notify pgrst, 'reload schema';
