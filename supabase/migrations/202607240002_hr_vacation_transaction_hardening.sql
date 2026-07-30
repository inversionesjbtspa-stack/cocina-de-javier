-- 202607240002_hr_vacation_transaction_hardening
-- Endurece vacaciones RRHH sin aplicar cambios a produccion desde Codex.

alter table public.hr_vacation_allocations
  add column if not exists employee_id uuid,
  add column if not exists allocation_status text not null default 'consumed',
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid references auth.users(id) on delete set null,
  add column if not exists release_reason text,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users(id) on delete set null,
  add column if not exists reverse_movement_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hr_vacation_allocations_days_positive_chk'
  ) then
    alter table public.hr_vacation_allocations
      add constraint hr_vacation_allocations_days_positive_chk check (allocated_days > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'hr_vacation_allocations_resulting_balance_chk'
  ) then
    alter table public.hr_vacation_allocations
      add constraint hr_vacation_allocations_resulting_balance_chk check (resulting_balance <= previous_balance);
  end if;
end $$;

alter table public.hr_vacation_documents
  add column if not exists mime_type text,
  add column if not exists file_size integer,
  add column if not exists version integer not null default 1;

create table if not exists public.hr_holiday_calendar_years (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  calendar_year integer not null,
  region_code text,
  commune_code text,
  verification_status text not null default 'incomplete',
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  source_name text,
  source_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_holiday_calendar_years_status_chk check (verification_status in ('verified', 'incomplete', 'missing'))
);

create unique index if not exists hr_holiday_calendar_years_unique_idx
  on public.hr_holiday_calendar_years(coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), calendar_year, coalesce(region_code, ''), coalesce(commune_code, ''));

create index if not exists hr_vacation_requests_overlap_idx
  on public.hr_vacation_requests(tenant_id, employee_id, start_date, end_date, status);

alter table public.hr_vacation_allocations
  drop constraint if exists hr_vacation_allocations_tenant_id_request_id_allocation_order_key;

create index if not exists hr_vacation_allocations_exact_idx
  on public.hr_vacation_allocations(tenant_id, request_id, vacation_period_id, allocation_type, allocation_status);

create unique index if not exists hr_vacation_allocations_one_active_reservation_uidx
  on public.hr_vacation_allocations(tenant_id, request_id, vacation_period_id, allocation_type)
  where allocation_type = 'reserved' and allocation_status = 'reserved';

create unique index if not exists hr_vacation_allocations_one_consumed_order_uidx
  on public.hr_vacation_allocations(tenant_id, request_id, allocation_order)
  where allocation_status in ('consumed', 'reserved');

alter table public.hr_holiday_calendar_years enable row level security;

drop policy if exists "hr members can read hr_holiday_calendar_years" on public.hr_holiday_calendar_years;
create policy "hr members can read hr_holiday_calendar_years"
on public.hr_holiday_calendar_years for select to authenticated
using (tenant_id is null or public.current_user_is_member(tenant_id));

drop policy if exists "hr admins can manage hr_holiday_calendar_years" on public.hr_holiday_calendar_years;
create policy "hr admins can manage hr_holiday_calendar_years"
on public.hr_holiday_calendar_years for all to authenticated
using (tenant_id is not null and public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]))
with check (tenant_id is not null and public.current_user_has_role(tenant_id, array['owner', 'admin', 'finance_manager']::public.app_role[]));

create or replace function public.hr_current_vacation_actor()
returns table(user_id uuid, tenant_id uuid, company_id uuid, actor_role public.app_role)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  user_id := auth.uid();
  if user_id is null then
    raise exception 'unauthorized';
  end if;

  return query
  select membership.user_id, membership.tenant_id, membership.company_id, membership.role
  from public.user_memberships membership
  where membership.user_id = auth.uid()
    and membership.status = 'active'
    and membership.role = any(array['owner', 'admin', 'finance_manager']::public.app_role[])
  order by membership.created_at asc
  limit 1;

  if not found then
    raise exception 'hr_forbidden';
  end if;
end;
$$;

create or replace function public.hr_vacation_has_overlap(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_start_date date,
  p_end_date date,
  p_exclude_request_id uuid default null
) returns boolean
language sql
security invoker
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.hr_vacation_requests request
    where request.tenant_id = p_tenant_id
      and request.employee_id = p_employee_id
      and request.status in ('solicitada', 'pendiente', 'aprobada', 'en_curso')
      and (p_exclude_request_id is null or request.id <> p_exclude_request_id)
      and request.start_date <= p_end_date
      and request.end_date >= p_start_date
  );
$$;

create or replace function public.hr_vacation_calendar_status(
  p_tenant_id uuid,
  p_start_date date,
  p_end_date date
) returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_year integer;
  v_status text := 'verified';
begin
  for v_year in
    select generate_series(extract(year from p_start_date)::integer, extract(year from p_end_date)::integer)
  loop
    if not exists (
      select 1
      from public.hr_holiday_calendar_years years
      where (years.tenant_id = p_tenant_id or years.tenant_id is null)
        and years.calendar_year = v_year
        and years.verification_status = 'verified'
    ) then
      if exists (
        select 1
        from public.hr_holiday_calendar_years years
        where (years.tenant_id = p_tenant_id or years.tenant_id is null)
          and years.calendar_year = v_year
          and years.verification_status = 'incomplete'
      ) then
        v_status := 'incomplete';
      else
        return 'missing';
      end if;
    end if;
  end loop;
  return v_status;
end;
$$;

create or replace function public.hr_release_vacation_reservations(
  p_request_id uuid,
  p_reason text default 'released'
) returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_request public.hr_vacation_requests%rowtype;
  v_allocation public.hr_vacation_allocations%rowtype;
  v_total numeric := 0;
  v_previous numeric;
  v_resulting numeric;
begin
  select * into v_actor from public.hr_current_vacation_actor();

  select * into v_request
  from public.hr_vacation_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'vacation_not_found';
  end if;
  if v_request.tenant_id <> v_actor.tenant_id then
    raise exception 'vacation_not_found';
  end if;

  for v_allocation in
    select *
    from public.hr_vacation_allocations
    where tenant_id = v_request.tenant_id
      and request_id = p_request_id
      and allocation_type = 'reserved'
      and allocation_status = 'reserved'
    order by allocation_order asc
    for update
  loop
    select available_balance into v_previous
    from public.hr_vacation_periods
    where id = v_allocation.vacation_period_id
      and tenant_id = v_request.tenant_id
    for update;

    update public.hr_vacation_periods
    set reserved_days = greatest(0, reserved_days - v_allocation.allocated_days),
        version = version + 1,
        updated_by = v_actor.user_id,
        updated_at = now()
    where id = v_allocation.vacation_period_id
      and tenant_id = v_request.tenant_id;

    select available_balance into v_resulting
    from public.hr_vacation_periods
    where id = v_allocation.vacation_period_id;

    update public.hr_vacation_allocations
    set allocation_status = 'released',
        released_at = now(),
        released_by = v_actor.user_id,
        release_reason = p_reason
    where id = v_allocation.id;

    insert into public.hr_vacation_movements(
      tenant_id, employee_id, vacation_period_id, request_id, movement_type, days,
      previous_balance, resulting_balance, created_by, notes, metadata
    ) values (
      v_request.tenant_id, v_request.employee_id, v_allocation.vacation_period_id, p_request_id,
      'reserva_liberada', v_allocation.allocated_days, v_previous, v_resulting,
      v_actor.user_id, p_reason, jsonb_build_object('allocation_id', v_allocation.id)
    );

    v_total := v_total + v_allocation.allocated_days;
  end loop;

  return v_total;
end;
$$;

drop function if exists public.hr_create_vacation_request(text, uuid, uuid, uuid, jsonb);
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
    created_by, vacation_start_date, last_counted_vacation_date, effective_rest_end_date,
    return_to_work_date, schedule_source, return_date_confirmed, is_fractioned,
    fractionation_agreement, advance_authorized, advance_days, snapshot, receipt_snapshot, version
  ) values (
    v_actor.tenant_id, v_employee_id, (p_payload->>'start_date')::date, (p_payload->>'end_date')::date,
    coalesce((p_payload->>'business_days')::numeric, 0), coalesce((p_payload->>'requested_business_days')::numeric, 0),
    coalesce((p_payload->>'projected_business_days')::numeric, 0), coalesce((p_payload->>'previous_balance')::numeric, 0),
    coalesce((p_payload->>'resulting_balance')::numeric, 0), v_status,
    p_payload->>'observation', v_actor.user_id, (p_payload->>'start_date')::date,
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

drop function if exists public.hr_reserve_vacation_days(text, uuid, uuid, uuid, uuid, jsonb);
create or replace function public.hr_reserve_vacation_days(
  p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_request public.hr_vacation_requests%rowtype;
  v_period public.hr_vacation_periods%rowtype;
  v_remaining numeric;
  v_take numeric;
  v_order integer := 1;
  v_existing numeric;
begin
  select * into v_actor from public.hr_current_vacation_actor();

  select * into v_request
  from public.hr_vacation_requests
  where id = p_request_id
  for update;

  if not found or v_request.tenant_id <> v_actor.tenant_id then
    raise exception 'vacation_not_found';
  end if;
  if v_request.status not in ('borrador', 'solicitada', 'pendiente') then
    raise exception 'vacation_not_reservable';
  end if;
  if public.hr_vacation_has_overlap(v_request.tenant_id, v_request.employee_id, v_request.start_date, v_request.end_date, v_request.id) then
    raise exception 'vacation_overlap';
  end if;

  select coalesce(sum(allocated_days), 0) into v_existing
  from public.hr_vacation_allocations
  where tenant_id = v_request.tenant_id
    and request_id = p_request_id
    and allocation_type = 'reserved'
    and allocation_status = 'reserved';

  if v_existing = v_request.business_days then
    return jsonb_build_object('ok', true, 'reserved_days', v_existing, 'idempotent', true);
  end if;

  perform public.hr_release_vacation_reservations(p_request_id, 'reservation_replaced');
  v_remaining := v_request.business_days;

  for v_period in
    select *
    from public.hr_vacation_periods
    where tenant_id = v_request.tenant_id
      and employee_id = v_request.employee_id
      and status in ('open', 'closed')
      and available_balance > 0
    order by period_start asc, created_at asc, id asc
    for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_period.available_balance);
    if v_take <= 0 then
      continue;
    end if;

    update public.hr_vacation_periods
    set reserved_days = reserved_days + v_take,
        version = version + 1,
        updated_by = v_actor.user_id,
        updated_at = now()
    where id = v_period.id;

    insert into public.hr_vacation_allocations(
      tenant_id, employee_id, request_id, vacation_period_id, allocation_order,
      allocated_days, previous_balance, resulting_balance, allocation_type, allocation_status
    ) values (
      v_request.tenant_id, v_request.employee_id, p_request_id, v_period.id, v_order,
      v_take, v_period.available_balance, v_period.available_balance - v_take, 'reserved', 'reserved'
    );

    insert into public.hr_vacation_movements(
      tenant_id, employee_id, vacation_period_id, request_id, movement_type, days,
      previous_balance, resulting_balance, created_by, notes
    ) values (
      v_request.tenant_id, v_request.employee_id, v_period.id, p_request_id, 'reserva',
      -v_take, v_period.available_balance, v_period.available_balance - v_take,
      v_actor.user_id, 'Reserva vacaciones'
    );

    v_remaining := v_remaining - v_take;
    v_order := v_order + 1;
  end loop;

  if v_remaining > 0 then
    raise exception 'insufficient_vacation_balance';
  end if;

  update public.hr_vacation_requests
  set status = 'pendiente',
      version = version + 1,
      updated_by = v_actor.user_id,
      updated_at = now()
  where id = p_request_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (v_actor.actor_role, v_actor.user_id, jsonb_build_object('reserved_days', v_request.business_days), v_actor.company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_reserved', v_actor.tenant_id);

  return jsonb_build_object('ok', true, 'reserved_days', v_request.business_days, 'idempotent', false);
end;
$$;

drop function if exists public.hr_approve_vacation_request(text, uuid, uuid, uuid, uuid, jsonb);
create or replace function public.hr_approve_vacation_request(
  p_request_id uuid,
  p_expected_version integer default null,
  p_calendar_override_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_request public.hr_vacation_requests%rowtype;
  v_employee_exists boolean;
  v_calendar_status text;
  v_document_number text;
  v_year integer := extract(year from current_date)::integer;
  v_allocation public.hr_vacation_allocations%rowtype;
  v_period public.hr_vacation_periods%rowtype;
  v_remaining numeric;
  v_take numeric;
  v_order integer := 1;
  v_reserved numeric;
  v_allocations jsonb := '[]'::jsonb;
begin
  select * into v_actor from public.hr_current_vacation_actor();

  select * into v_request
  from public.hr_vacation_requests
  where id = p_request_id
  for update;

  if not found or v_request.tenant_id <> v_actor.tenant_id then
    raise exception 'vacation_not_found';
  end if;
  if p_expected_version is not null and v_request.version <> p_expected_version then
    raise exception 'vacation_version_conflict';
  end if;
  if v_request.status = 'aprobada' then
    raise exception 'vacation_already_approved';
  end if;
  if v_request.status in ('rechazada', 'anulada') then
    raise exception 'vacation_not_approvable';
  end if;
  if public.hr_vacation_has_overlap(v_request.tenant_id, v_request.employee_id, v_request.start_date, v_request.end_date, v_request.id) then
    raise exception 'vacation_overlap';
  end if;

  select exists(
    select 1 from public.hr_employees employee
    where employee.id = v_request.employee_id
      and employee.tenant_id = v_request.tenant_id
      and coalesce(employee.status, 'activo') = 'activo'
  ) into v_employee_exists;
  if not v_employee_exists then
    raise exception 'employee_not_in_tenant';
  end if;

  v_calendar_status := public.hr_vacation_calendar_status(v_request.tenant_id, v_request.start_date, v_request.end_date);
  if v_calendar_status <> 'verified' and nullif(p_calendar_override_reason, '') is null then
    raise exception 'vacation_calendar_not_verified';
  end if;

  select coalesce(sum(allocated_days), 0) into v_reserved
  from public.hr_vacation_allocations
  where tenant_id = v_request.tenant_id
    and request_id = p_request_id
    and allocation_type = 'reserved'
    and allocation_status = 'reserved';

  if v_reserved > 0 and v_reserved <> v_request.business_days then
    perform public.hr_release_vacation_reservations(p_request_id, 'reservation_changed_before_approval');
    v_reserved := 0;
  end if;

  if v_reserved = v_request.business_days then
    for v_allocation in
      select *
      from public.hr_vacation_allocations
      where tenant_id = v_request.tenant_id
        and request_id = p_request_id
        and allocation_type = 'reserved'
        and allocation_status = 'reserved'
      order by allocation_order asc
      for update
    loop
      select * into v_period
      from public.hr_vacation_periods
      where id = v_allocation.vacation_period_id
        and tenant_id = v_request.tenant_id
      for update;

      update public.hr_vacation_periods
      set reserved_days = greatest(0, reserved_days - v_allocation.allocated_days),
          used_days = used_days + v_allocation.allocated_days,
          version = version + 1,
          updated_by = v_actor.user_id,
          updated_at = now()
      where id = v_period.id;

      update public.hr_vacation_allocations
      set allocation_type = 'earned',
          allocation_status = 'consumed'
      where id = v_allocation.id;

      insert into public.hr_vacation_movements(
        tenant_id, employee_id, vacation_period_id, request_id, movement_type, days,
        previous_balance, resulting_balance, created_by, notes, metadata
      ) values (
        v_request.tenant_id, v_request.employee_id, v_period.id, p_request_id,
        'aprobacion', -v_allocation.allocated_days, v_allocation.previous_balance,
        v_allocation.resulting_balance, v_actor.user_id, 'Aprobacion desde reserva',
        jsonb_build_object('allocation_id', v_allocation.id)
      );

      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'period_id', v_period.id,
        'allocated_days', v_allocation.allocated_days,
        'previous_balance', v_allocation.previous_balance,
        'resulting_balance', v_allocation.resulting_balance,
        'allocation_order', v_allocation.allocation_order
      ));
    end loop;
  else
    delete from public.hr_vacation_allocations
    where tenant_id = v_request.tenant_id
      and request_id = p_request_id
      and allocation_status in ('reserved', 'consumed');

    v_remaining := v_request.business_days;
    for v_period in
      select *
      from public.hr_vacation_periods
      where tenant_id = v_request.tenant_id
        and employee_id = v_request.employee_id
        and status in ('open', 'closed')
        and available_balance > 0
      order by period_start asc, created_at asc, id asc
      for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_period.available_balance);
      if v_take <= 0 then
        continue;
      end if;

      insert into public.hr_vacation_allocations(
        tenant_id, employee_id, request_id, vacation_period_id, allocation_order,
        allocated_days, previous_balance, resulting_balance, allocation_type, allocation_status
      ) values (
        v_request.tenant_id, v_request.employee_id, p_request_id, v_period.id, v_order,
        v_take, v_period.available_balance, v_period.available_balance - v_take, 'earned', 'consumed'
      ) returning * into v_allocation;

      update public.hr_vacation_periods
      set used_days = used_days + v_take,
          version = version + 1,
          updated_by = v_actor.user_id,
          updated_at = now()
      where id = v_period.id;

      insert into public.hr_vacation_movements(
        tenant_id, employee_id, vacation_period_id, request_id, movement_type, days,
        previous_balance, resulting_balance, created_by, notes, metadata
      ) values (
        v_request.tenant_id, v_request.employee_id, v_period.id, p_request_id,
        'aprobacion', -v_take, v_period.available_balance, v_period.available_balance - v_take,
        v_actor.user_id, 'Aprobacion FIFO', jsonb_build_object('allocation_id', v_allocation.id)
      );

      v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
        'period_id', v_period.id,
        'allocated_days', v_take,
        'previous_balance', v_period.available_balance,
        'resulting_balance', v_period.available_balance - v_take,
        'allocation_order', v_order
      ));
      v_remaining := v_remaining - v_take;
      v_order := v_order + 1;
    end loop;

    if v_remaining > 0 then
      if not v_request.advance_authorized or v_remaining > coalesce(v_request.advance_days, 0) then
        raise exception 'insufficient_vacation_balance';
      end if;

      select * into v_period
      from public.hr_vacation_periods
      where tenant_id = v_request.tenant_id
        and employee_id = v_request.employee_id
      order by period_start desc, created_at desc, id desc
      limit 1
      for update;

      if not found then
        raise exception 'vacation_period_not_found';
      end if;

      insert into public.hr_vacation_allocations(
        tenant_id, employee_id, request_id, vacation_period_id, allocation_order,
        allocated_days, previous_balance, resulting_balance, allocation_type, allocation_status
      ) values (
        v_request.tenant_id, v_request.employee_id, p_request_id, v_period.id, v_order,
        v_remaining, 0, -v_remaining, 'advance', 'consumed'
      ) returning * into v_allocation;

      update public.hr_vacation_periods
      set advance_days = advance_days + v_remaining,
          version = version + 1,
          updated_by = v_actor.user_id,
          updated_at = now()
      where id = v_period.id;

      insert into public.hr_vacation_movements(
        tenant_id, employee_id, vacation_period_id, request_id, movement_type, days,
        previous_balance, resulting_balance, created_by, notes, metadata
      ) values (
        v_request.tenant_id, v_request.employee_id, v_period.id, p_request_id,
        'anticipo_aprobado', -v_remaining, 0, -v_remaining, v_actor.user_id,
        'Anticipo autorizado', jsonb_build_object('allocation_id', v_allocation.id)
      );
    end if;
  end if;

  v_document_number := public.hr_next_document_number(v_request.tenant_id, 'FER', v_year);

  update public.hr_vacation_requests
  set status = 'aprobada',
      approved_by = v_actor.user_id,
      approved_at = now(),
      document_number = v_document_number,
      receipt_number = v_document_number,
      receipt_status = 'vigente',
      receipt_snapshot = coalesce(snapshot, '{}'::jsonb) || jsonb_build_object('allocations', v_allocations, 'calendarStatus', v_calendar_status),
      snapshot = coalesce(snapshot, '{}'::jsonb) || jsonb_build_object('allocations', v_allocations, 'calendarStatus', v_calendar_status),
      vacation_allocations = v_allocations,
      document_generation_status = 'pending',
      version = version + 1,
      updated_by = v_actor.user_id,
      updated_at = now()
  where id = p_request_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (v_actor.actor_role, v_actor.user_id, jsonb_build_object('document_number', v_document_number, 'allocations', v_allocations, 'calendar_status', v_calendar_status, 'calendar_override_reason', p_calendar_override_reason), v_actor.company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_approved', v_actor.tenant_id);

  return jsonb_build_object('document_number', v_document_number, 'allocations', v_allocations, 'calendar_status', v_calendar_status);
end;
$$;

drop function if exists public.hr_cancel_vacation_request(text, uuid, uuid, uuid, uuid, text);
create or replace function public.hr_cancel_vacation_request(
  p_request_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_request public.hr_vacation_requests%rowtype;
  v_allocation public.hr_vacation_allocations%rowtype;
  v_previous numeric;
  v_resulting numeric;
  v_movement_id uuid;
  v_reversed numeric := 0;
begin
  select * into v_actor from public.hr_current_vacation_actor();

  select * into v_request
  from public.hr_vacation_requests
  where id = p_request_id
  for update;

  if not found or v_request.tenant_id <> v_actor.tenant_id then
    raise exception 'vacation_not_found';
  end if;
  if v_request.status = 'anulada' then
    raise exception 'vacation_already_cancelled';
  end if;

  if v_request.status = 'aprobada' then
    for v_allocation in
      select *
      from public.hr_vacation_allocations
      where tenant_id = v_request.tenant_id
        and request_id = p_request_id
        and allocation_status = 'consumed'
      order by allocation_order desc
      for update
    loop
      select available_balance into v_previous
      from public.hr_vacation_periods
      where id = v_allocation.vacation_period_id
        and tenant_id = v_request.tenant_id
      for update;

      if v_allocation.allocation_type = 'advance' then
        update public.hr_vacation_periods
        set advance_days = greatest(0, advance_days - v_allocation.allocated_days),
            version = version + 1,
            updated_by = v_actor.user_id,
            updated_at = now()
        where id = v_allocation.vacation_period_id;
      else
        update public.hr_vacation_periods
        set used_days = greatest(0, used_days - v_allocation.allocated_days),
            version = version + 1,
            updated_by = v_actor.user_id,
            updated_at = now()
        where id = v_allocation.vacation_period_id;
      end if;

      select available_balance into v_resulting
      from public.hr_vacation_periods
      where id = v_allocation.vacation_period_id;

      insert into public.hr_vacation_movements(
        tenant_id, employee_id, vacation_period_id, request_id, movement_type, days,
        previous_balance, resulting_balance, created_by, notes, metadata
      ) values (
        v_request.tenant_id, v_request.employee_id, v_allocation.vacation_period_id, p_request_id,
        'reversa_aprobacion', v_allocation.allocated_days, v_previous, v_resulting,
        v_actor.user_id, coalesce(p_reason, 'Anulacion de vacaciones'),
        jsonb_build_object('allocation_id', v_allocation.id)
      ) returning id into v_movement_id;

      update public.hr_vacation_allocations
      set allocation_status = 'reversed',
          reversed_at = now(),
          reversed_by = v_actor.user_id,
          reverse_movement_id = v_movement_id
      where id = v_allocation.id;

      v_reversed := v_reversed + v_allocation.allocated_days;
    end loop;
  else
    v_reversed := public.hr_release_vacation_reservations(p_request_id, coalesce(p_reason, 'Solicitud anulada antes de aprobacion'));
  end if;

  update public.hr_vacation_requests
  set status = 'anulada',
      receipt_status = 'anulado',
      cancelled_by = v_actor.user_id,
      cancelled_at = now(),
      observation = coalesce(nullif(p_reason, ''), 'Solicitud anulada'),
      document_generation_status = 'cancelled',
      version = version + 1,
      updated_by = v_actor.user_id,
      updated_at = now()
  where id = p_request_id;

  update public.hr_vacation_documents
  set document_status = 'anulado',
      cancelled_by = v_actor.user_id,
      cancelled_at = now(),
      cancellation_reason = p_reason
  where tenant_id = v_request.tenant_id
    and vacation_request_id = p_request_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, before_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (v_actor.actor_role, v_actor.user_id, jsonb_build_object('reason', p_reason, 'reversed_days', v_reversed, 'status', 'anulada'), jsonb_build_object('status', v_request.status), v_actor.company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_cancelled', v_actor.tenant_id);

  return jsonb_build_object('ok', true, 'reversed_days', v_reversed);
end;
$$;

drop function if exists public.hr_reverse_vacation_request(text, uuid, uuid, uuid, uuid, text);
create or replace function public.hr_reverse_vacation_request(
  p_request_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return public.hr_cancel_vacation_request(p_request_id, p_reason);
end;
$$;

drop function if exists public.hr_reject_vacation_request(text, uuid, uuid, uuid, uuid, text);
create or replace function public.hr_reject_vacation_request(
  p_request_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor record;
  v_request public.hr_vacation_requests%rowtype;
  v_released numeric;
begin
  select * into v_actor from public.hr_current_vacation_actor();

  select * into v_request
  from public.hr_vacation_requests
  where id = p_request_id
  for update;

  if not found or v_request.tenant_id <> v_actor.tenant_id then
    raise exception 'vacation_not_found';
  end if;
  if v_request.status in ('aprobada', 'anulada', 'rechazada') then
    raise exception 'vacation_not_rejectable';
  end if;

  v_released := public.hr_release_vacation_reservations(p_request_id, coalesce(p_reason, 'Solicitud rechazada'));

  update public.hr_vacation_requests
  set status = 'rechazada',
      rejected_by = v_actor.user_id,
      rejected_at = now(),
      observation = p_reason,
      document_generation_status = 'not_applicable',
      version = version + 1,
      updated_by = v_actor.user_id,
      updated_at = now()
  where id = p_request_id;

  insert into public.audit_events(actor_role, actor_user_id, after_data, before_data, company_id, entity_id, entity_type, event_type, tenant_id)
  values (v_actor.actor_role, v_actor.user_id, jsonb_build_object('reason', p_reason, 'released_days', v_released, 'status', 'rechazada'), jsonb_build_object('status', v_request.status), v_actor.company_id, p_request_id, 'hr_vacation_request', 'hr.vacation_rejected', v_actor.tenant_id);

  return jsonb_build_object('ok', true, 'released_days', v_released);
end;
$$;

insert into public.hr_holiday_calendar_years(calendar_year, verification_status, verified_at, source_name, source_reference)
values (2026, 'incomplete', now(), 'Fixture RRHH', 'Calendario parcial de desarrollo')
on conflict do nothing;

revoke execute on function public.hr_current_vacation_actor() from public;
revoke execute on function public.hr_create_vacation_request(jsonb) from public;
revoke execute on function public.hr_reserve_vacation_days(uuid) from public;
revoke execute on function public.hr_approve_vacation_request(uuid, integer, text) from public;
revoke execute on function public.hr_cancel_vacation_request(uuid, text) from public;
revoke execute on function public.hr_reverse_vacation_request(uuid, text) from public;
revoke execute on function public.hr_reject_vacation_request(uuid, text) from public;

grant execute on function public.hr_create_vacation_request(jsonb) to authenticated;
grant execute on function public.hr_reserve_vacation_days(uuid) to authenticated;
grant execute on function public.hr_approve_vacation_request(uuid, integer, text) to authenticated;
grant execute on function public.hr_cancel_vacation_request(uuid, text) to authenticated;
grant execute on function public.hr_reverse_vacation_request(uuid, text) to authenticated;
grant execute on function public.hr_reject_vacation_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
