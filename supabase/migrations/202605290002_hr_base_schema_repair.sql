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

create table if not exists public.hr_payment_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  payslip_id uuid,
  period text not null,
  payment_type text not null,
  amount numeric(14, 4) not null default 0,
  glosa text,
  status text not null default 'borrador',
  scheduled_date date,
  payment_date date,
  bank_name text,
  bank_code text,
  account_type text,
  account_number text,
  payment_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_payment_items
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists payslip_id uuid,
  add column if not exists period text,
  add column if not exists payment_type text,
  add column if not exists amount numeric(14, 4) default 0,
  add column if not exists glosa text,
  add column if not exists status text default 'borrador',
  add column if not exists scheduled_date date,
  add column if not exists payment_date date,
  add column if not exists bank_name text,
  add column if not exists bank_code text,
  add column if not exists account_type text,
  add column if not exists account_number text,
  add column if not exists payment_email text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.hr_employee_bank_accounts
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists bank_name text,
  add column if not exists bank_code text,
  add column if not exists account_type text,
  add column if not exists account_number text,
  add column if not exists payment_email text,
  add column if not exists account_holder_name text,
  add column if not exists account_holder_rut text,
  add column if not exists validation_status text default 'pending',
  add column if not exists is_primary boolean default true,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.hr_payslips
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists period text,
  add column if not exists storage_bucket text default 'hr-payslips',
  add column if not exists storage_path text,
  add column if not exists original_filename text,
  add column if not exists net_amount numeric(14, 4) default 0,
  add column if not exists earnings_amount numeric(14, 4) default 0,
  add column if not exists deductions_amount numeric(14, 4) default 0,
  add column if not exists status text default 'cargada',
  add column if not exists source_file text,
  add column if not exists uploaded_by uuid,
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
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid,
  add column if not exists send_status text default 'pendiente_envio',
  add column if not exists send_attempts integer default 0,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.hr_vacation_requests
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists business_days numeric(8, 2) default 0,
  add column if not exists previous_balance numeric(8, 2) default 0,
  add column if not exists resulting_balance numeric(8, 2) default 0,
  add column if not exists status text default 'solicitada',
  add column if not exists observation text,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists document_date date,
  add column if not exists contract_period_start date,
  add column if not exists contract_period_end date,
  add column if not exists progressive_days numeric(8, 2) default 0,
  add column if not exists non_business_days numeric(8, 2) default 0,
  add column if not exists fractional_vacation boolean default false,
  add column if not exists note text,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.hr_vacation_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  vacation_request_id uuid,
  employee_id uuid,
  document_type text not null default 'papeleta',
  storage_bucket text not null default 'hr-vacation-documents',
  storage_path text,
  generated_at timestamptz not null default now(),
  generated_by uuid,
  created_at timestamptz not null default now()
);

alter table public.hr_vacation_documents
  add column if not exists tenant_id uuid,
  add column if not exists vacation_request_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists document_type text default 'papeleta',
  add column if not exists storage_bucket text default 'hr-vacation-documents',
  add column if not exists storage_path text,
  add column if not exists generated_at timestamptz default now(),
  add column if not exists generated_by uuid,
  add column if not exists created_at timestamptz default now();

create table if not exists public.hr_salary_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  payslip_id uuid,
  period text not null,
  component_type text not null,
  label text not null,
  amount numeric(14, 4) not null default 0,
  quantity numeric(10, 2),
  source text not null default 'payslip_pdf',
  raw_text text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.hr_salary_components
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists payslip_id uuid,
  add column if not exists period text,
  add column if not exists component_type text,
  add column if not exists label text,
  add column if not exists amount numeric(14, 4) default 0,
  add column if not exists quantity numeric(10, 2),
  add column if not exists source text default 'payslip_pdf',
  add column if not exists raw_text text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now();

alter table public.hr_accountant_data_rows
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
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
  add column if not exists source_novelty_ids uuid[] default '{}'::uuid[],
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.hr_advances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  request_date date not null default current_date,
  requested_amount numeric(14, 4) not null default 0,
  approved_amount numeric(14, 4) not null default 0,
  reason text,
  discount_period text,
  status text not null default 'solicitado',
  observation text,
  payment_item_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_bonuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  bonus_type text not null,
  period text not null,
  amount numeric(14, 4) not null default 0,
  reason text,
  status text not null default 'borrador',
  observation text,
  payment_item_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_payment_batch_items
  add column if not exists tenant_id uuid,
  add column if not exists batch_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists payment_item_id uuid,
  add column if not exists payment_type text,
  add column if not exists amount numeric(14, 4) default 0,
  add column if not exists glosa text,
  add column if not exists status text default 'incluido_en_nomina',
  add column if not exists created_at timestamptz default now();

do $$
begin
  if to_regclass('public.tenants') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_payment_items_tenant_id_fkey') then
      alter table public.hr_payment_items add constraint hr_payment_items_tenant_id_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;
    end if;
  end if;

  if to_regclass('public.hr_employees') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_payment_items_employee_id_fkey') then
      alter table public.hr_payment_items add constraint hr_payment_items_employee_id_fkey foreign key (employee_id) references public.hr_employees(id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_salary_components_employee_id_fkey') then
      alter table public.hr_salary_components add constraint hr_salary_components_employee_id_fkey foreign key (employee_id) references public.hr_employees(id) on delete set null;
    end if;
  end if;

  if to_regclass('public.hr_payslips') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_payment_items_payslip_id_fkey') then
      alter table public.hr_payment_items add constraint hr_payment_items_payslip_id_fkey foreign key (payslip_id) references public.hr_payslips(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_salary_components_payslip_id_fkey') then
      alter table public.hr_salary_components add constraint hr_salary_components_payslip_id_fkey foreign key (payslip_id) references public.hr_payslips(id) on delete cascade;
    end if;
  end if;

  if to_regclass('public.hr_payment_items') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_monthly_novelties_payment_item_id_fkey') and to_regclass('public.hr_monthly_novelties') is not null then
      alter table public.hr_monthly_novelties add constraint hr_monthly_novelties_payment_item_id_fkey foreign key (payment_item_id) references public.hr_payment_items(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_payment_batch_items_payment_item_id_fkey') and to_regclass('public.hr_payment_batch_items') is not null then
      alter table public.hr_payment_batch_items add constraint hr_payment_batch_items_payment_item_id_fkey foreign key (payment_item_id) references public.hr_payment_items(id) on delete set null;
    end if;
  end if;
end $$;

create unique index if not exists hr_employee_bank_accounts_primary_uidx on public.hr_employee_bank_accounts(employee_id, is_primary);
create unique index if not exists hr_payslips_tenant_employee_period_uidx on public.hr_payslips(tenant_id, employee_id, period);
create unique index if not exists hr_accountant_data_rows_tenant_period_rut_sheet_uidx on public.hr_accountant_data_rows(tenant_id, period, rut, sheet_name);
create unique index if not exists hr_salary_components_tenant_employee_period_component_uidx on public.hr_salary_components(tenant_id, employee_id, period, component_type, label, source);
create unique index if not exists hr_monthly_novelties_unique_idx on public.hr_monthly_novelties(tenant_id, employee_id, period, novelty_type);

create index if not exists hr_payment_items_tenant_period_idx on public.hr_payment_items(tenant_id, period, status, payment_type);
create index if not exists hr_payment_items_employee_idx on public.hr_payment_items(employee_id, period);
create index if not exists hr_payslips_tenant_period_idx on public.hr_payslips(tenant_id, period);
create index if not exists hr_vacation_requests_tenant_status_idx on public.hr_vacation_requests(tenant_id, status, start_date);
create index if not exists hr_accountant_data_rows_tenant_period_idx on public.hr_accountant_data_rows(tenant_id, period, rut);
create index if not exists hr_salary_components_tenant_period_idx on public.hr_salary_components(tenant_id, period, component_type);

grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on table
  public.hr_payment_items,
  public.hr_employee_bank_accounts,
  public.hr_payslips,
  public.hr_vacation_requests,
  public.hr_vacation_documents,
  public.hr_salary_components,
  public.hr_accountant_data_rows,
  public.hr_advances,
  public.hr_bonuses,
  public.hr_payment_batches,
  public.hr_payment_batch_items,
  public.hr_monthly_novelties
to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

alter table public.hr_payment_items enable row level security;
alter table public.hr_employee_bank_accounts enable row level security;
alter table public.hr_payslips enable row level security;
alter table public.hr_vacation_requests enable row level security;
alter table public.hr_vacation_documents enable row level security;
alter table public.hr_salary_components enable row level security;
alter table public.hr_accountant_data_rows enable row level security;
alter table public.hr_advances enable row level security;
alter table public.hr_bonuses enable row level security;
alter table public.hr_payment_batches enable row level security;
alter table public.hr_payment_batch_items enable row level security;
alter table public.hr_monthly_novelties enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'hr_payment_items',
    'hr_employee_bank_accounts',
    'hr_payslips',
    'hr_vacation_requests',
    'hr_vacation_documents',
    'hr_salary_components',
    'hr_accountant_data_rows',
    'hr_advances',
    'hr_bonuses',
    'hr_payment_batches',
    'hr_payment_batch_items',
    'hr_monthly_novelties'
  ]
  loop
    if to_regclass('public.' || target_table) is not null then
      if exists (select 1 from pg_proc where proname = 'current_user_is_member')
         and not exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = target_table
             and policyname = 'members can read ' || target_table
         ) then
        execute format('create policy "members can read %s" on public.%I for select to authenticated using (public.current_user_is_member(tenant_id))', target_table, target_table);
      end if;

      if exists (select 1 from pg_proc where proname = 'current_user_has_role')
         and not exists (
           select 1 from pg_policies
           where schemaname = 'public'
             and tablename = target_table
             and policyname = 'admins can manage ' || target_table
         ) then
        execute format('create policy "admins can manage %s" on public.%I for all to authenticated using (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[])) with check (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[]))', target_table, target_table);
      end if;
    end if;
  end loop;
end $$;

do $$
declare
  target_table text;
  trigger_name text;
begin
  foreach target_table in array array[
    'hr_payment_items',
    'hr_employee_bank_accounts',
    'hr_payslips',
    'hr_vacation_requests',
    'hr_salary_components',
    'hr_accountant_data_rows',
    'hr_advances',
    'hr_bonuses',
    'hr_payment_batches',
    'hr_monthly_novelties'
  ]
  loop
    trigger_name := target_table || '_set_updated_at';
    if to_regclass('public.' || target_table) is not null
       and exists (select 1 from pg_proc where proname = 'set_updated_at')
       and not exists (select 1 from pg_trigger where tgname = trigger_name) then
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

notify pgrst, 'reload schema';
