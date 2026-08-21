create table if not exists public.hr_vacation_calendar_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  monday_closed boolean not null default true,
  tuesday_working boolean not null default true,
  wednesday_working boolean not null default true,
  thursday_working boolean not null default true,
  friday_working boolean not null default true,
  saturday_working boolean not null default true,
  sunday_working_default boolean not null default true,
  public_holidays_working boolean not null default true,
  monthly_sundays_off integer not null default 2,
  timezone text not null default 'America/Santiago',
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_vacation_calendar_policies_sundays_chk check (monthly_sundays_off between 0 and 5),
  constraint hr_vacation_calendar_policies_timezone_chk check (length(trim(timezone)) > 0)
);

create unique index if not exists hr_vacation_calendar_policies_one_active_uidx
  on public.hr_vacation_calendar_policies(tenant_id)
  where active;

create table if not exists public.hr_company_calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  exception_date date not null,
  exception_type text not null default 'COMPANY_CLOSED',
  note text,
  source text not null default 'manual',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hr_company_calendar_exceptions_type_chk check (exception_type in ('COMPANY_CLOSED', 'COMPANY_WORKING_OVERRIDE')),
  unique (tenant_id, exception_date, exception_type)
);

create table if not exists public.hr_employee_monthly_days_off (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  off_date date not null,
  day_type text not null default 'SUNDAY_OFF',
  source text not null default 'monthly_schedule',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hr_employee_monthly_days_off_type_chk check (day_type in ('SUNDAY_OFF')),
  constraint hr_employee_monthly_days_off_sunday_chk check (day_type <> 'SUNDAY_OFF' or extract(dow from off_date) = 0),
  unique (tenant_id, employee_id, off_date, day_type)
);

create index if not exists hr_company_calendar_exceptions_tenant_date_idx
  on public.hr_company_calendar_exceptions(tenant_id, exception_date);

create index if not exists hr_employee_monthly_days_off_employee_date_idx
  on public.hr_employee_monthly_days_off(tenant_id, employee_id, off_date);

alter table public.hr_vacation_calendar_policies enable row level security;
alter table public.hr_company_calendar_exceptions enable row level security;
alter table public.hr_employee_monthly_days_off enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hr_vacation_calendar_policies',
    'hr_company_calendar_exceptions',
    'hr_employee_monthly_days_off'
  ]
  loop
    execute format('drop policy if exists "hr members can read %s" on public.%I', table_name, table_name);
    execute format('create policy "hr members can read %s" on public.%I for select to authenticated using (public.current_user_is_member(tenant_id))', table_name, table_name);
    execute format('drop policy if exists "hr admins can manage %s" on public.%I', table_name, table_name);
    execute format('create policy "hr admins can manage %s" on public.%I for all to authenticated using (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[])) with check (public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[]))', table_name, table_name);
  end loop;
end $$;

insert into public.hr_vacation_calendar_policies (
  tenant_id,
  monday_closed,
  tuesday_working,
  wednesday_working,
  thursday_working,
  friday_working,
  saturday_working,
  sunday_working_default,
  public_holidays_working,
  monthly_sundays_off,
  timezone,
  active
)
select
  id,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  2,
  'America/Santiago',
  true
from public.tenants
on conflict do nothing;

create or replace function public.hr_create_vacation_request(
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_employee_id uuid := (p_payload->>'employee_id')::uuid;
  v_request_id uuid;
  v_status text := coalesce(p_payload->>'status', 'solicitada');
begin
  select * into v_actor from public.hr_current_vacation_actor();

  if not exists (
    select 1 from public.hr_employees employee
    where employee.id = v_employee_id
      and employee.tenant_id = v_actor.tenant_id
      and coalesce(employee.status, 'activo') = 'activo'
  ) then
    raise exception 'employee_not_in_tenant';
  end if;

  if public.hr_vacation_has_overlap(v_actor.tenant_id, v_employee_id, (p_payload->>'start_date')::date, (p_payload->>'end_date')::date, null) then
    raise exception 'vacation_overlap';
  end if;

  insert into public.hr_vacation_requests (
    tenant_id, employee_id, start_date, end_date, business_days, requested_business_days,
    projected_business_days, previous_balance, resulting_balance, status, observation,
    non_business_days, created_by, vacation_start_date, last_counted_vacation_date, effective_rest_end_date,
    return_to_work_date, schedule_source, return_date_confirmed, is_fractioned,
    fractionation_agreement, advance_authorized, advance_days, snapshot, receipt_snapshot, version
  ) values (
    v_actor.tenant_id, v_employee_id, (p_payload->>'start_date')::date, (p_payload->>'end_date')::date,
    coalesce((p_payload->>'business_days')::numeric, 0), coalesce((p_payload->>'requested_business_days')::numeric, 0),
    coalesce((p_payload->>'projected_business_days')::numeric, 0), coalesce((p_payload->>'previous_balance')::numeric, 0),
    coalesce((p_payload->>'resulting_balance')::numeric, 0), v_status,
    p_payload->>'observation', coalesce((p_payload->>'non_business_days')::numeric, 0),
    v_actor.user_id, (p_payload->>'start_date')::date,
    nullif(p_payload->>'last_counted_vacation_date', '')::date, nullif(p_payload->>'effective_rest_end_date', '')::date,
    nullif(p_payload->>'return_to_work_date', '')::date, p_payload->>'schedule_source',
    coalesce((p_payload->>'return_date_confirmed')::boolean, false), coalesce((p_payload->>'is_fractioned')::boolean, false),
    coalesce((p_payload->>'fractionation_agreement')::boolean, false), coalesce((p_payload->>'advance_authorized')::boolean, false),
    coalesce((p_payload->>'advance_days')::numeric, 0), p_payload->'snapshot', p_payload->'snapshot', 1
  )
  returning id into v_request_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (v_actor.actor_role, v_actor.user_id, p_payload - 'tenant_id', v_actor.company_id, v_request_id, 'hr_vacation_request', 'hr.vacation_created', v_actor.tenant_id);

  return v_request_id;
end;
$$;

revoke execute on function public.hr_create_vacation_request(jsonb) from public;
revoke execute on function public.hr_create_vacation_request(jsonb) from anon;
grant execute on function public.hr_create_vacation_request(jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
