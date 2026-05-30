create table if not exists public.hr_monthly_novelties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  employee_id uuid,
  period text not null,
  novelty_type text not null,
  quantity numeric(10, 2) not null default 0,
  hours numeric(10, 2) not null default 0,
  amount numeric(14, 4) not null default 0,
  status text not null default 'confirmada',
  notes text,
  payment_item_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_monthly_novelties
  add column if not exists tenant_id uuid,
  add column if not exists employee_id uuid,
  add column if not exists period text,
  add column if not exists novelty_type text,
  add column if not exists quantity numeric(10, 2) default 0,
  add column if not exists hours numeric(10, 2) default 0,
  add column if not exists amount numeric(14, 4) default 0,
  add column if not exists status text default 'confirmada',
  add column if not exists notes text,
  add column if not exists payment_item_id uuid,
  add column if not exists created_by uuid,
  add column if not exists updated_by uuid,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if to_regclass('public.tenants') is not null
     and not exists (select 1 from pg_constraint where conname = 'hr_monthly_novelties_tenant_id_fkey') then
    alter table public.hr_monthly_novelties
      add constraint hr_monthly_novelties_tenant_id_fkey
      foreign key (tenant_id) references public.tenants(id) on delete cascade;
  end if;

  if to_regclass('public.hr_employees') is not null
     and not exists (select 1 from pg_constraint where conname = 'hr_monthly_novelties_employee_id_fkey') then
    alter table public.hr_monthly_novelties
      add constraint hr_monthly_novelties_employee_id_fkey
      foreign key (employee_id) references public.hr_employees(id) on delete cascade;
  end if;

  if to_regclass('public.hr_payment_items') is not null
     and not exists (select 1 from pg_constraint where conname = 'hr_monthly_novelties_payment_item_id_fkey') then
    alter table public.hr_monthly_novelties
      add constraint hr_monthly_novelties_payment_item_id_fkey
      foreign key (payment_item_id) references public.hr_payment_items(id) on delete set null;
  end if;
end $$;

alter table public.hr_accountant_data_rows
  add column if not exists discounts numeric(14, 4) default 0,
  add column if not exists source_novelty_ids uuid[] default '{}'::uuid[];

alter table public.hr_vacation_requests
  add column if not exists document_date date,
  add column if not exists contract_period_start date,
  add column if not exists contract_period_end date,
  add column if not exists progressive_days numeric(8, 2) default 0,
  add column if not exists non_business_days numeric(8, 2) default 0,
  add column if not exists fractional_vacation boolean default false,
  add column if not exists note text;

alter table public.hr_payslips
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid references auth.users(id) on delete set null,
  add column if not exists send_status text default 'pendiente_envio',
  add column if not exists send_attempts integer default 0;

create unique index if not exists hr_monthly_novelties_unique_idx
  on public.hr_monthly_novelties(tenant_id, employee_id, period, novelty_type);

create index if not exists hr_monthly_novelties_tenant_period_idx
  on public.hr_monthly_novelties(tenant_id, period, novelty_type, status);

create index if not exists hr_monthly_novelties_employee_idx
  on public.hr_monthly_novelties(employee_id, period);

grant select, insert, update, delete on table public.hr_monthly_novelties to authenticated;
grant select, insert, update, delete on table public.hr_monthly_novelties to service_role;

alter table public.hr_monthly_novelties enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'hr_monthly_novelties'
      and policyname = 'members can read hr_monthly_novelties'
  ) then
    create policy "members can read hr_monthly_novelties"
      on public.hr_monthly_novelties
      for select
      to authenticated
      using (public.current_user_is_member(tenant_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'hr_monthly_novelties'
      and policyname = 'admins can manage hr_monthly_novelties'
  ) then
    create policy "admins can manage hr_monthly_novelties"
      on public.hr_monthly_novelties
      for all
      to authenticated
      using (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]))
      with check (public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'hr_monthly_novelties_set_updated_at') then
    create trigger hr_monthly_novelties_set_updated_at
      before update on public.hr_monthly_novelties
      for each row execute function public.set_updated_at();
  end if;
end $$;

notify pgrst, 'reload schema';
