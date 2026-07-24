create table if not exists public.hr_vacation_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  base_days numeric(8, 4) not null default 15,
  progressive_days numeric(8, 4) not null default 0,
  conventional_days numeric(8, 4) not null default 0,
  positive_adjustments numeric(8, 4) not null default 0,
  negative_adjustments numeric(8, 4) not null default 0,
  used_days numeric(8, 4) not null default 0,
  reserved_days numeric(8, 4) not null default 0,
  advance_days numeric(8, 4) not null default 0,
  available_balance numeric(8, 4) generated always as (
    base_days + progressive_days + conventional_days + positive_adjustments - negative_adjustments - used_days - reserved_days - advance_days
  ) stored,
  continuous_block_required numeric(8, 4) not null default 10,
  continuous_block_used numeric(8, 4) not null default 0,
  status text not null default 'open',
  version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_vacation_periods_dates_chk check (period_end >= period_start),
  constraint hr_vacation_periods_days_chk check (base_days >= 0 and progressive_days >= 0 and reserved_days >= 0 and used_days >= 0),
  unique (tenant_id, employee_id, period_start, period_end)
);

alter table public.hr_vacation_requests
  add column if not exists requested_business_days numeric(8, 4),
  add column if not exists projected_business_days numeric(8, 4),
  add column if not exists vacation_start_date date,
  add column if not exists last_counted_vacation_date date,
  add column if not exists effective_rest_end_date date,
  add column if not exists return_to_work_date date,
  add column if not exists schedule_source text,
  add column if not exists return_date_confirmed boolean default false,
  add column if not exists is_fractioned boolean default false,
  add column if not exists fractionation_agreement boolean default false,
  add column if not exists agreement_date date,
  add column if not exists agreement_document_id uuid,
  add column if not exists advance_authorized boolean default false,
  add column if not exists advance_days numeric(8, 4) not null default 0,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists document_number text,
  add column if not exists snapshot jsonb,
  add column if not exists document_generation_status text default 'pending',
  add column if not exists version integer not null default 1;

create table if not exists public.hr_vacation_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  request_id uuid not null references public.hr_vacation_requests(id) on delete cascade,
  vacation_period_id uuid references public.hr_vacation_periods(id) on delete restrict,
  allocated_days numeric(8, 4) not null,
  previous_balance numeric(8, 4) not null,
  resulting_balance numeric(8, 4) not null,
  allocation_order integer not null,
  allocation_type text not null default 'earned',
  created_at timestamptz not null default now(),
  unique (tenant_id, request_id, allocation_order)
);

create table if not exists public.hr_vacation_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  vacation_period_id uuid references public.hr_vacation_periods(id) on delete set null,
  request_id uuid references public.hr_vacation_requests(id) on delete set null,
  movement_type text not null,
  days numeric(8, 4) not null,
  previous_balance numeric(8, 4) not null,
  resulting_balance numeric(8, 4) not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.hr_vacation_progressive_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  previous_employer_years numeric(8, 4) not null default 0,
  credited_months integer not null default 0,
  accreditation_date date,
  effective_from date,
  recognized_days numeric(8, 4) not null default 0,
  document_path text,
  document_type text,
  status text not null default 'pendiente',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_holiday_calendar (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  scope text not null default 'national',
  region_code text,
  commune_code text,
  mandatory boolean not null default false,
  source_name text,
  source_reference text,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hr_document_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  document_type text not null,
  document_year integer not null,
  next_number integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (tenant_id, document_type, document_year)
);

create index if not exists hr_vacation_periods_employee_idx on public.hr_vacation_periods(tenant_id, employee_id, period_start);
create index if not exists hr_vacation_allocations_request_idx on public.hr_vacation_allocations(tenant_id, request_id, allocation_order);
create index if not exists hr_vacation_movements_employee_idx on public.hr_vacation_movements(tenant_id, employee_id, created_at desc);
create index if not exists hr_vacation_progressive_employee_idx on public.hr_vacation_progressive_records(tenant_id, employee_id, status);
create index if not exists hr_holiday_calendar_date_idx on public.hr_holiday_calendar(holiday_date, scope, status);
create unique index if not exists hr_holiday_calendar_unique_idx
  on public.hr_holiday_calendar(coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), holiday_date, name, scope, coalesce(region_code, ''), coalesce(commune_code, ''));
create unique index if not exists hr_vacation_requests_document_number_uidx on public.hr_vacation_requests(tenant_id, document_number) where document_number is not null;

alter table public.hr_vacation_periods enable row level security;
alter table public.hr_vacation_allocations enable row level security;
alter table public.hr_vacation_movements enable row level security;
alter table public.hr_vacation_progressive_records enable row level security;
alter table public.hr_holiday_calendar enable row level security;
alter table public.hr_document_sequences enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'hr_vacation_periods',
    'hr_vacation_allocations',
    'hr_vacation_movements',
    'hr_vacation_progressive_records',
    'hr_holiday_calendar',
    'hr_document_sequences'
  ]
  loop
    execute format('drop policy if exists "hr members can read %s" on public.%I', table_name, table_name);
    execute format('create policy "hr members can read %s" on public.%I for select to authenticated using (tenant_id is null or public.current_user_is_member(tenant_id))', table_name, table_name);
    execute format('drop policy if exists "hr admins can manage %s" on public.%I', table_name, table_name);
    execute format('create policy "hr admins can manage %s" on public.%I for all to authenticated using (tenant_id is not null and public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[])) with check (tenant_id is not null and public.current_user_has_role(tenant_id, array[''owner'', ''admin'', ''finance_manager'']::public.app_role[]))', table_name, table_name);
  end loop;
end $$;

create or replace function public.hr_next_document_number(
  p_tenant_id uuid,
  p_document_type text,
  p_year integer
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number integer;
begin
  insert into public.hr_document_sequences(tenant_id, document_type, document_year, next_number)
  values (p_tenant_id, p_document_type, p_year, 2)
  on conflict (tenant_id, document_type, document_year)
  do update set next_number = public.hr_document_sequences.next_number + 1, updated_at = now()
  returning next_number - 1 into v_number;

  return upper(p_document_type) || '-' || p_year::text || '-' || lpad(v_number::text, 6, '0');
end;
$$;

create or replace function public.hr_create_vacation_request(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid := (p_payload->>'employee_id')::uuid;
  v_request_id uuid;
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;

  if not exists (select 1 from public.hr_employees where id = v_employee_id and tenant_id = p_tenant_id) then
    raise exception 'employee_not_in_tenant';
  end if;

  insert into public.hr_vacation_requests (
    tenant_id, employee_id, start_date, end_date, business_days, requested_business_days,
    projected_business_days, previous_balance, resulting_balance, status, observation,
    created_by, vacation_start_date, last_counted_vacation_date, effective_rest_end_date,
    return_to_work_date, schedule_source, return_date_confirmed, is_fractioned,
    fractionation_agreement, advance_authorized, advance_days, snapshot, version
  ) values (
    p_tenant_id, v_employee_id, (p_payload->>'start_date')::date, (p_payload->>'end_date')::date,
    coalesce((p_payload->>'business_days')::numeric, 0), coalesce((p_payload->>'requested_business_days')::numeric, 0),
    coalesce((p_payload->>'projected_business_days')::numeric, 0), coalesce((p_payload->>'previous_balance')::numeric, 0),
    coalesce((p_payload->>'resulting_balance')::numeric, 0), coalesce(p_payload->>'status', 'solicitada'),
    p_payload->>'observation', p_user_id, (p_payload->>'start_date')::date,
    nullif(p_payload->>'last_counted_vacation_date', '')::date, nullif(p_payload->>'effective_rest_end_date', '')::date,
    nullif(p_payload->>'return_to_work_date', '')::date, p_payload->>'schedule_source',
    coalesce((p_payload->>'return_date_confirmed')::boolean, false), coalesce((p_payload->>'is_fractioned')::boolean, false),
    coalesce((p_payload->>'fractionation_agreement')::boolean, false), coalesce((p_payload->>'advance_authorized')::boolean, false),
    coalesce((p_payload->>'advance_days')::numeric, 0), p_payload, 1
  )
  returning id into v_request_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (p_actor_role, p_user_id, p_payload, p_company_id, v_request_id, 'hr_vacation_request', 'hr.vacation_created', p_tenant_id);

  return v_request_id;
end;
$$;

create or replace function public.hr_approve_vacation_request(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_snapshot jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.hr_vacation_requests%rowtype;
  v_document_number text;
  v_year integer := extract(year from current_date)::integer;
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;

  select * into v_request
  from public.hr_vacation_requests
  where id = p_request_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'vacation_not_found';
  end if;
  if v_request.status = 'aprobada' then
    raise exception 'vacation_already_approved';
  end if;
  if v_request.status = 'anulada' then
    raise exception 'vacation_cancelled';
  end if;

  v_document_number := public.hr_next_document_number(p_tenant_id, 'FER', v_year);

  update public.hr_vacation_requests
  set status = 'aprobada',
      approved_by = p_user_id,
      approved_at = now(),
      document_number = v_document_number,
      receipt_number = v_document_number,
      receipt_status = 'vigente',
      receipt_snapshot = p_snapshot,
      snapshot = p_snapshot,
      receipt_generated_at = now(),
      receipt_generated_by = p_user_id,
      document_generation_status = 'pending',
      version = version + 1
  where id = p_request_id and tenant_id = p_tenant_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (p_actor_role, p_user_id, jsonb_build_object('document_number', v_document_number, 'snapshot', p_snapshot), p_company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_approved', p_tenant_id);

  return jsonb_build_object('document_number', v_document_number);
end;
$$;

create or replace function public.hr_cancel_vacation_request(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.hr_vacation_requests%rowtype;
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;

  select * into v_request
  from public.hr_vacation_requests
  where id = p_request_id and tenant_id = p_tenant_id
  for update;

  if not found then
    raise exception 'vacation_not_found';
  end if;
  if v_request.status = 'anulada' then
    return jsonb_build_object('already_cancelled', true);
  end if;

  update public.hr_vacation_requests
  set status = 'anulada',
      receipt_status = 'anulado',
      cancelled_by = p_user_id,
      cancelled_at = now(),
      observation = coalesce(nullif(p_reason, ''), 'Solicitud anulada'),
      version = version + 1
  where id = p_request_id and tenant_id = p_tenant_id;

  update public.hr_vacation_documents
  set document_status = 'anulado',
      cancelled_by = p_user_id,
      cancelled_at = now(),
      cancellation_reason = p_reason
  where tenant_id = p_tenant_id and vacation_request_id = p_request_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, before_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (p_actor_role, p_user_id, jsonb_build_object('reason', p_reason, 'status', 'anulada'), jsonb_build_object('status', v_request.status), p_company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_cancelled', p_tenant_id);

  return jsonb_build_object('already_cancelled', false);
end;
$$;

create or replace function public.hr_reserve_vacation_days(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_allocations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;

  update public.hr_vacation_requests
  set status = 'pendiente', version = version + 1
  where id = p_request_id and tenant_id = p_tenant_id and status in ('borrador', 'solicitada', 'pendiente');

  delete from public.hr_vacation_allocations
  where tenant_id = p_tenant_id and request_id = p_request_id and allocation_type = 'reserved';

  for item in select * from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb))
  loop
    insert into public.hr_vacation_allocations(tenant_id, employee_id, request_id, vacation_period_id, allocated_days, previous_balance, resulting_balance, allocation_order, allocation_type)
    select p_tenant_id, r.employee_id, p_request_id, nullif(item->>'period_id', '')::uuid,
      (item->>'days')::numeric, (item->>'previous_balance')::numeric, (item->>'resulting_balance')::numeric,
      (item->>'allocation_order')::integer, 'reserved'
    from public.hr_vacation_requests r
    where r.id = p_request_id and r.tenant_id = p_tenant_id;

    update public.hr_vacation_periods
    set reserved_days = reserved_days + (item->>'days')::numeric,
        version = version + 1,
        updated_by = p_user_id,
        updated_at = now()
    where id = nullif(item->>'period_id', '')::uuid and tenant_id = p_tenant_id;
  end loop;

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (p_actor_role, p_user_id, jsonb_build_object('allocations', p_allocations), p_company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_reserved', p_tenant_id);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.hr_reverse_vacation_request(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.hr_cancel_vacation_request(p_actor_role, p_company_id, p_tenant_id, p_user_id, p_request_id, p_reason);
end;
$$;

create or replace function public.hr_adjust_vacation_period(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_period_id uuid,
  p_days numeric,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period public.hr_vacation_periods%rowtype;
  v_previous numeric;
  v_resulting numeric;
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;
  select * into v_period from public.hr_vacation_periods where id = p_period_id and tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'vacation_period_not_found';
  end if;
  v_previous := v_period.available_balance;

  if p_days >= 0 then
    update public.hr_vacation_periods set positive_adjustments = positive_adjustments + p_days, updated_by = p_user_id, updated_at = now(), version = version + 1 where id = p_period_id;
  else
    update public.hr_vacation_periods set negative_adjustments = negative_adjustments + abs(p_days), updated_by = p_user_id, updated_at = now(), version = version + 1 where id = p_period_id;
  end if;

  select available_balance into v_resulting from public.hr_vacation_periods where id = p_period_id;
  insert into public.hr_vacation_movements(tenant_id, employee_id, vacation_period_id, movement_type, days, previous_balance, resulting_balance, created_by, notes)
  values (p_tenant_id, v_period.employee_id, p_period_id, 'ajuste_manual', p_days, v_previous, v_resulting, p_user_id, p_notes);
  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (p_actor_role, p_user_id, jsonb_build_object('days', p_days, 'notes', p_notes, 'resulting_balance', v_resulting), p_company_id, p_period_id, 'hr_vacation_period', 'hr.vacation_period_adjusted', p_tenant_id);
  return jsonb_build_object('previous_balance', v_previous, 'resulting_balance', v_resulting);
end;
$$;

create or replace function public.hr_accredit_progressive_vacation(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_payload jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_employee_id uuid := (p_payload->>'employee_id')::uuid;
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;
  if not exists (select 1 from public.hr_employees where id = v_employee_id and tenant_id = p_tenant_id) then
    raise exception 'employee_not_in_tenant';
  end if;
  insert into public.hr_vacation_progressive_records(
    tenant_id, employee_id, previous_employer_years, credited_months, accreditation_date,
    effective_from, recognized_days, document_path, document_type, status, reviewed_by,
    reviewed_at, review_notes, created_by
  ) values (
    p_tenant_id, v_employee_id, coalesce((p_payload->>'previous_employer_years')::numeric, 0),
    coalesce((p_payload->>'credited_months')::integer, 0), nullif(p_payload->>'accreditation_date', '')::date,
    nullif(p_payload->>'effective_from', '')::date, coalesce((p_payload->>'recognized_days')::numeric, 0),
    p_payload->>'document_path', p_payload->>'document_type', coalesce(p_payload->>'status', 'pendiente'),
    p_user_id, now(), p_payload->>'review_notes', p_user_id
  ) returning id into v_id;
  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (p_actor_role, p_user_id, p_payload, p_company_id, v_id, 'hr_vacation_progressive_record', 'hr.vacation_progressive_accredited', p_tenant_id);
  return v_id;
end;
$$;

create or replace function public.hr_reject_vacation_request(
  p_actor_role text,
  p_company_id uuid,
  p_tenant_id uuid,
  p_user_id uuid,
  p_request_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor_role not in ('owner', 'admin', 'finance_manager') then
    raise exception 'hr_forbidden';
  end if;

  update public.hr_vacation_requests
  set status = 'rechazada', rejected_by = p_user_id, rejected_at = now(), observation = p_reason, version = version + 1
  where id = p_request_id and tenant_id = p_tenant_id and status <> 'aprobada';

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (p_actor_role, p_user_id, jsonb_build_object('reason', p_reason, 'status', 'rechazada'), p_company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_rejected', p_tenant_id);

  return jsonb_build_object('ok', true);
end;
$$;

insert into public.hr_holiday_calendar(holiday_date, name, scope, mandatory, source_name, source_reference, verified_at, status)
values
  ('2026-01-01', 'Ano Nuevo', 'national', true, 'Fixture RRHH', 'Calendario legal Chile', now(), 'active'),
  ('2026-05-01', 'Dia Nacional del Trabajo', 'national', true, 'Fixture RRHH', 'Calendario legal Chile', now(), 'active'),
  ('2026-05-21', 'Glorias Navales', 'national', true, 'Fixture RRHH', 'Calendario legal Chile', now(), 'active'),
  ('2026-09-18', 'Independencia Nacional', 'national', true, 'Fixture RRHH', 'Calendario legal Chile', now(), 'active'),
  ('2026-09-19', 'Glorias del Ejercito', 'national', true, 'Fixture RRHH', 'Calendario legal Chile', now(), 'active'),
  ('2026-12-25', 'Navidad', 'national', true, 'Fixture RRHH', 'Calendario legal Chile', now(), 'active')
on conflict do nothing;

notify pgrst, 'reload schema';
