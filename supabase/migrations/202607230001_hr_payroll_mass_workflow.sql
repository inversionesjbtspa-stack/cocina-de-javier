create extension if not exists pgcrypto;

create table if not exists public.hr_payment_concepts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  code text not null,
  label text not null,
  category text not null default 'remuneracion',
  requires_description boolean not null default false,
  active boolean not null default true,
  display_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table if not exists public.hr_payslip_import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  period text not null,
  status text not null default 'preview',
  total_files integer not null default 0,
  auto_matched integer not null default 0,
  needs_review integer not null default 0,
  duplicated integer not null default 0,
  errors integer not null default 0,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table if not exists public.hr_salary_data_audit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete set null,
  period text not null,
  field_name text not null,
  old_value text,
  new_value text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  source text not null default 'salary_grid'
);

alter table public.hr_payslips
  add column if not exists file_sha256 text,
  add column if not exists match_method text,
  add column if not exists match_level text,
  add column if not exists detected_rut text,
  add column if not exists detected_name text,
  add column if not exists detected_period text,
  add column if not exists detected_employer text,
  add column if not exists detected_document_date date,
  add column if not exists batch_id uuid references public.hr_payslip_import_batches(id) on delete set null,
  add column if not exists review_reason text,
  add column if not exists metadata jsonb default '{}'::jsonb;

alter table public.hr_accountant_data_rows
  add column if not exists reason text,
  add column if not exists cash_allowance_amount numeric(14, 4) default 0,
  add column if not exists movilization_amount numeric(14, 4) default 0,
  add column if not exists phone_allowance_amount numeric(14, 4) default 0,
  add column if not exists sunday_surcharge_amount numeric(14, 4) default 0,
  add column if not exists company_loan_amount numeric(14, 4) default 0,
  add column if not exists ccaf_loan_amount numeric(14, 4) default 0;

create unique index if not exists hr_payslips_tenant_hash_idx
  on public.hr_payslips(tenant_id, file_sha256)
  where file_sha256 is not null;

create index if not exists hr_payslip_import_batches_tenant_period_idx
  on public.hr_payslip_import_batches(tenant_id, period, created_at desc);

create index if not exists hr_salary_data_audit_tenant_period_idx
  on public.hr_salary_data_audit(tenant_id, period, changed_at desc);

grant select, insert, update on table
  public.hr_payment_concepts,
  public.hr_payslip_import_batches,
  public.hr_salary_data_audit
to authenticated;

grant select, insert, update on table
  public.hr_payment_concepts,
  public.hr_payslip_import_batches,
  public.hr_salary_data_audit
to service_role;

alter table public.hr_payment_concepts enable row level security;
alter table public.hr_payslip_import_batches enable row level security;
alter table public.hr_salary_data_audit enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'hr_payment_concepts',
    'hr_payslip_import_batches',
    'hr_salary_data_audit'
  ]
  loop
    execute format('drop policy if exists "members can read %s" on public.%I', target_table, target_table);
    execute format('create policy "members can read %s" on public.%I for select to authenticated using (public.current_user_is_member(tenant_id))', target_table, target_table);
    execute format('drop policy if exists "admins can manage %s" on public.%I', target_table, target_table);
    execute format('create policy "admins can manage %s" on public.%I for all to authenticated using (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[])) with check (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[]))', target_table, target_table);
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_payment_concepts_set_updated_at') then
    create trigger hr_payment_concepts_set_updated_at
      before update on public.hr_payment_concepts
      for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.hr_payment_concepts (tenant_id, code, label, category, requires_description, display_order)
select tenants.id, concept.code, concept.label, concept.category, concept.requires_description, concept.display_order
from public.tenants
cross join (values
  ('remuneracion_mensual', 'Remuneracion mensual', 'remuneracion', false, 10),
  ('anticipo', 'Anticipo', 'anticipo', false, 20),
  ('aguinaldo', 'Aguinaldo', 'bono', false, 30),
  ('anticipo_aguinaldo', 'Anticipo de aguinaldo', 'anticipo', false, 40),
  ('bono_produccion', 'Bono de produccion', 'bono', false, 50),
  ('bono_compensatorio', 'Bono compensatorio', 'bono', false, 60),
  ('bono_responsabilidad', 'Bono de responsabilidad', 'bono', false, 70),
  ('recargo_domingo', 'Recargo domingo', 'bono', false, 80),
  ('movilizacion', 'Movilizacion', 'asignacion', false, 90),
  ('asignacion_telefono', 'Asignacion telefono', 'asignacion', false, 100),
  ('prestamo_empresa', 'Prestamo empresa', 'descuento', false, 110),
  ('prestamo_caja', 'Prestamo caja', 'descuento', false, 120),
  ('finiquito', 'Finiquito', 'termino', false, 130),
  ('honorario', 'Honorario', 'honorario', false, 140),
  ('reembolso', 'Reembolso', 'reembolso', false, 150),
  ('otro_bono', 'Otro bono', 'bono', true, 160),
  ('otro_concepto', 'Otro concepto', 'otro', true, 170)
) as concept(code, label, category, requires_description, display_order)
on conflict (tenant_id, code) do update
set label = excluded.label,
    category = excluded.category,
    requires_description = excluded.requires_description,
    display_order = excluded.display_order,
    active = true;

notify pgrst, 'reload schema';
