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

do $$
begin
  if to_regclass('public.hr_payment_items') is not null then
    alter table public.hr_payment_items
      add column if not exists tranche_label text,
      add column if not exists retention_reason text,
      add column if not exists source_type text default 'rrhh',
      add column if not exists source_id uuid,
      add column if not exists paid_by uuid,
      add column if not exists paid_at timestamptz;
  else
    raise notice 'Skipping hr_payment_items phase 2 columns because public.hr_payment_items does not exist.';
  end if;

  if to_regclass('public.hr_payment_batches') is not null then
    alter table public.hr_payment_batches
      add column if not exists tranche_label text,
      add column if not exists selection_filters jsonb default '{}'::jsonb,
      add column if not exists generated_by uuid,
      add column if not exists metadata jsonb default '{}'::jsonb;
  else
    raise notice 'Skipping hr_payment_batches phase 2 columns because public.hr_payment_batches does not exist.';
  end if;

  if to_regclass('public.hr_payslips') is not null then
    alter table public.hr_payslips
      add column if not exists last_send_error text,
      add column if not exists last_send_attempt_at timestamptz,
      add column if not exists resend_count integer default 0;
  else
    raise notice 'Skipping hr_payslips phase 2 columns because public.hr_payslips does not exist.';
  end if;

  if to_regclass('public.hr_advances') is not null then
    alter table public.hr_advances
      add column if not exists approved_by uuid,
      add column if not exists approved_at timestamptz,
      add column if not exists paid_at timestamptz,
      add column if not exists deducted_at timestamptz,
      add column if not exists metadata jsonb default '{}'::jsonb;
  else
    raise notice 'Skipping hr_advances phase 2 columns because public.hr_advances does not exist.';
  end if;

  if to_regclass('public.hr_vacation_requests') is not null then
    alter table public.hr_vacation_requests
      add column if not exists request_date date default current_date;
  else
    raise notice 'Skipping hr_vacation_requests phase 2 repair columns because public.hr_vacation_requests does not exist.';
  end if;
end $$;

create table if not exists public.hr_termination_settlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  termination_date date not null,
  causal text not null,
  settlement_amount numeric(14, 4) not null default 0,
  pending_vacation_days numeric(8, 2) not null default 0,
  pending_advances_amount numeric(14, 4) not null default 0,
  observation text,
  status text not null default 'borrador',
  payment_item_id uuid,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_termination_settlements
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists termination_date date,
  add column if not exists causal text,
  add column if not exists settlement_amount numeric(14, 4) default 0,
  add column if not exists pending_vacation_days numeric(8, 2) default 0,
  add column if not exists pending_advances_amount numeric(14, 4) default 0,
  add column if not exists observation text,
  add column if not exists status text default 'borrador',
  add column if not exists payment_item_id uuid,
  add column if not exists created_by uuid,
  add column if not exists approved_by uuid,
  add column if not exists approved_at timestamptz,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.hr_honorarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  full_name text not null,
  rut text not null,
  period text not null,
  amount numeric(14, 4) not null default 0,
  glosa text,
  bank_name text,
  bank_code text,
  account_type text,
  account_number text,
  payment_email text,
  status text not null default 'pendiente_pago',
  payment_item_id uuid,
  observation text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_honorarios
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists full_name text,
  add column if not exists rut text,
  add column if not exists period text,
  add column if not exists amount numeric(14, 4) default 0,
  add column if not exists glosa text,
  add column if not exists bank_name text,
  add column if not exists bank_code text,
  add column if not exists account_type text,
  add column if not exists account_number text,
  add column if not exists payment_email text,
  add column if not exists status text default 'pendiente_pago',
  add column if not exists payment_item_id uuid,
  add column if not exists observation text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.hr_vacation_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  period text not null,
  movement_type text not null,
  days numeric(8, 2) not null default 0,
  balance_after numeric(8, 2) not null default 0,
  source_type text,
  source_id uuid,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.hr_vacation_ledger
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists period text,
  add column if not exists movement_type text,
  add column if not exists days numeric(8, 2) default 0,
  add column if not exists balance_after numeric(8, 2) default 0,
  add column if not exists source_type text,
  add column if not exists source_id uuid,
  add column if not exists note text,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz default now();

create table if not exists public.hr_payslip_send_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  payslip_id uuid,
  employee_id uuid,
  payment_item_id uuid,
  recipient_email text,
  status text not null default 'pendiente',
  error text,
  sent_by uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.hr_payslip_send_events
  add column if not exists tenant_id uuid,
  add column if not exists payslip_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists payment_item_id uuid,
  add column if not exists recipient_email text,
  add column if not exists status text default 'pendiente',
  add column if not exists error text,
  add column if not exists sent_by uuid,
  add column if not exists sent_at timestamptz,
  add column if not exists created_at timestamptz default now();

do $$
begin
  if to_regclass('public.tenants') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_termination_settlements_tenant_id_fkey') then
      alter table public.hr_termination_settlements add constraint hr_termination_settlements_tenant_id_fkey foreign key (tenant_id) references public.tenants(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_honorarios_tenant_id_fkey') then
      alter table public.hr_honorarios add constraint hr_honorarios_tenant_id_fkey foreign key (tenant_id) references public.tenants(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_vacation_ledger_tenant_id_fkey') then
      alter table public.hr_vacation_ledger add constraint hr_vacation_ledger_tenant_id_fkey foreign key (tenant_id) references public.tenants(id);
    end if;
  end if;

  if to_regclass('public.hr_employees') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_termination_settlements_employee_id_fkey') then
      alter table public.hr_termination_settlements add constraint hr_termination_settlements_employee_id_fkey foreign key (employee_id) references public.hr_employees(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_honorarios_employee_id_fkey') then
      alter table public.hr_honorarios add constraint hr_honorarios_employee_id_fkey foreign key (employee_id) references public.hr_employees(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_vacation_ledger_employee_id_fkey') then
      alter table public.hr_vacation_ledger add constraint hr_vacation_ledger_employee_id_fkey foreign key (employee_id) references public.hr_employees(id);
    end if;
  end if;

  if to_regclass('public.hr_payment_items') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_termination_settlements_payment_item_id_fkey') then
      alter table public.hr_termination_settlements add constraint hr_termination_settlements_payment_item_id_fkey foreign key (payment_item_id) references public.hr_payment_items(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_honorarios_payment_item_id_fkey') then
      alter table public.hr_honorarios add constraint hr_honorarios_payment_item_id_fkey foreign key (payment_item_id) references public.hr_payment_items(id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'hr_payslip_send_events_payment_item_id_fkey') then
      alter table public.hr_payslip_send_events add constraint hr_payslip_send_events_payment_item_id_fkey foreign key (payment_item_id) references public.hr_payment_items(id);
    end if;
  end if;

  if to_regclass('public.hr_payslips') is not null then
    if not exists (select 1 from pg_constraint where conname = 'hr_payslip_send_events_payslip_id_fkey') then
      alter table public.hr_payslip_send_events add constraint hr_payslip_send_events_payslip_id_fkey foreign key (payslip_id) references public.hr_payslips(id);
    end if;
  end if;
end $$;

create index if not exists hr_termination_settlements_tenant_period_idx on public.hr_termination_settlements(tenant_id, termination_date, status);
create index if not exists hr_termination_settlements_employee_idx on public.hr_termination_settlements(employee_id, status);
create index if not exists hr_honorarios_tenant_period_idx on public.hr_honorarios(tenant_id, period, status);
create index if not exists hr_honorarios_rut_idx on public.hr_honorarios(tenant_id, rut, period);
create index if not exists hr_vacation_ledger_tenant_employee_period_idx on public.hr_vacation_ledger(tenant_id, employee_id, period);
create index if not exists hr_vacation_ledger_source_idx on public.hr_vacation_ledger(source_type, source_id);
create index if not exists hr_payslip_send_events_tenant_payslip_idx on public.hr_payslip_send_events(tenant_id, payslip_id, created_at desc);

do $$
begin
  if to_regclass('public.hr_payment_items') is not null then
    create index if not exists hr_payment_items_tenant_status_period_idx on public.hr_payment_items(tenant_id, status, period, payment_type);
  else
    raise notice 'Skipping hr_payment_items_tenant_status_period_idx because public.hr_payment_items does not exist.';
  end if;

  if to_regclass('public.hr_payment_batches') is not null then
    create index if not exists hr_payment_batches_tranche_idx on public.hr_payment_batches(tenant_id, period, tranche_label);
  else
    raise notice 'Skipping hr_payment_batches_tranche_idx because public.hr_payment_batches does not exist.';
  end if;
end $$;

grant select, insert, update on table
  public.hr_termination_settlements,
  public.hr_honorarios,
  public.hr_vacation_ledger,
  public.hr_payslip_send_events
to authenticated;
grant select, insert, update on table
  public.hr_termination_settlements,
  public.hr_honorarios,
  public.hr_vacation_ledger,
  public.hr_payslip_send_events
to service_role;

alter table public.hr_termination_settlements enable row level security;
alter table public.hr_honorarios enable row level security;
alter table public.hr_vacation_ledger enable row level security;
alter table public.hr_payslip_send_events enable row level security;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'hr_termination_settlements',
    'hr_honorarios',
    'hr_vacation_ledger',
    'hr_payslip_send_events'
  ]
  loop
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
       and to_regtype('public.app_role') is not null
       and not exists (
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
    'hr_termination_settlements',
    'hr_honorarios'
  ]
  loop
    trigger_name := target_table || '_set_updated_at';
    if exists (select 1 from pg_proc where proname = 'set_updated_at')
       and not exists (select 1 from pg_trigger where tgname = trigger_name) then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', trigger_name, target_table);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
