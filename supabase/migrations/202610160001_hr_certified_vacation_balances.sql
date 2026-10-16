begin;

create table if not exists public.hr_vacation_certified_openings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  employee_id uuid not null references public.hr_employees(id),
  rut text not null,
  balance_days numeric(12,4) not null,
  effective_cutoff_date date not null,
  source text not null default 'certified_opening_balance',
  source_file text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  source_row integer not null check (source_row > 0),
  hire_date date not null,
  base_days numeric(8,4) not null default 15 check (base_days = 15),
  progressive_days_current integer not null default 0 check (progressive_days_current >= 0),
  recognized_previous_years numeric(8,4) check (recognized_previous_years between 0 and 10),
  annual_entitlement_override numeric(8,4) check (annual_entitlement_override >= 15),
  override_reason text,
  internal_alert text,
  previous_operating_balance numeric(12,4) not null,
  absorbed_request_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique (tenant_id,employee_id),
  unique (id,tenant_id,employee_id),
  unique (id,tenant_id),
  unique (tenant_id,source_hash,source_row,effective_cutoff_date),
  check (annual_entitlement_override is null or nullif(trim(override_reason),'') is not null),
  check (hire_date <= effective_cutoff_date)
);

alter table public.hr_vacation_periods
  add column if not exists certified_opening_balance_id uuid references public.hr_vacation_certified_openings(id),
  add column if not exists earned_on date;
alter table public.hr_vacation_requests
  add column if not exists certified_opening_balance_id uuid references public.hr_vacation_certified_openings(id);
create unique index if not exists hr_certified_period_earned_uidx
  on public.hr_vacation_periods(certified_opening_balance_id,earned_on)
  where certified_opening_balance_id is not null;
create index if not exists hr_certified_opening_cutoff_idx
  on public.hr_vacation_certified_openings(tenant_id,effective_cutoff_date,employee_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='hr_certified_period_owner_fk') then
    alter table public.hr_vacation_periods add constraint hr_certified_period_owner_fk
      foreign key(certified_opening_balance_id,tenant_id,employee_id)
      references public.hr_vacation_certified_openings(id,tenant_id,employee_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='hr_certified_request_owner_fk') then
    alter table public.hr_vacation_requests add constraint hr_certified_request_owner_fk
      foreign key(certified_opening_balance_id,tenant_id,employee_id)
      references public.hr_vacation_certified_openings(id,tenant_id,employee_id);
  end if;
end $$;
alter table public.hr_vacation_certified_openings enable row level security;
revoke all on public.hr_vacation_certified_openings from public,anon,authenticated,service_role;
grant select on public.hr_vacation_certified_openings to authenticated,service_role;
drop policy if exists hr_certified_openings_read on public.hr_vacation_certified_openings;
create policy hr_certified_openings_read on public.hr_vacation_certified_openings for select to authenticated
  using (public.current_user_has_role(tenant_id,array['owner','admin','finance_manager']::public.app_role[]));

create or replace function public.hr_certified_opening_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin raise exception 'certified_opening_is_immutable'; end $$;
drop trigger if exists hr_certified_opening_immutable on public.hr_vacation_certified_openings;
create trigger hr_certified_opening_immutable before update or delete on public.hr_vacation_certified_openings
  for each row execute function public.hr_certified_opening_immutable();

create or replace view public.hr_vacation_certified_opening_state with (security_invoker=true) as
  select opening.*, effective_cutoff_date <= (now() at time zone 'America/Santiago')::date as is_active
  from public.hr_vacation_certified_openings opening;
grant select on public.hr_vacation_certified_opening_state to authenticated,service_role;

create table if not exists public.hr_vacation_entitlement_changes (
  id uuid primary key default gen_random_uuid(),
  opening_id uuid not null references public.hr_vacation_certified_openings(id),
  tenant_id uuid not null references public.tenants(id),
  effective_from date not null,
  progressive_days_current integer not null check (progressive_days_current>=0),
  recognized_previous_years numeric(8,4) check (recognized_previous_years between 0 and 10),
  annual_entitlement_override numeric(8,4) check (annual_entitlement_override>=15),
  reason text not null check (length(trim(reason))>0),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  unique(opening_id,effective_from),
  foreign key(opening_id,tenant_id) references public.hr_vacation_certified_openings(id,tenant_id)
);
alter table public.hr_vacation_entitlement_changes enable row level security;
revoke all on public.hr_vacation_entitlement_changes from public,anon,authenticated,service_role;
grant select on public.hr_vacation_entitlement_changes to authenticated,service_role;
drop policy if exists hr_vacation_entitlement_changes_read on public.hr_vacation_entitlement_changes;
create policy hr_vacation_entitlement_changes_read on public.hr_vacation_entitlement_changes for select to authenticated
  using (public.current_user_has_role(tenant_id,array['owner','admin','finance_manager']::public.app_role[]));
drop trigger if exists hr_vacation_entitlement_changes_immutable on public.hr_vacation_entitlement_changes;
create trigger hr_vacation_entitlement_changes_immutable before update or delete on public.hr_vacation_entitlement_changes
  for each row execute function public.hr_certified_opening_immutable();

create or replace function public.hr_certified_annual_days(p_opening public.hr_vacation_certified_openings,p_on date)
returns numeric language plpgsql stable set search_path=public,pg_temp as $$
declare c public.hr_vacation_entitlement_changes;
begin
  select * into c from public.hr_vacation_entitlement_changes where opening_id=p_opening.id and effective_from<=p_on order by effective_from desc limit 1;
  if found then return coalesce(c.annual_entitlement_override,p_opening.base_days+greatest(c.progressive_days_current,
    greatest(0,floor((extract(year from age(p_on,p_opening.hire_date))+coalesce(c.recognized_previous_years,0)-10)/3)))); end if;
  return coalesce(p_opening.annual_entitlement_override,p_opening.base_days + greatest(p_opening.progressive_days_current,
    greatest(0,floor((extract(year from age(p_on,p_opening.hire_date)) + coalesce(p_opening.recognized_previous_years,0) - 10)/3))));
end;
$$;

create or replace function public.hr_vacation_period_is_vested(p_id uuid,p_as_of date)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.hr_vacation_periods p
    where p.id=p_id and coalesce(p.earned_on,p.period_end+1)<=p_as_of
      and p.certified_opening_balance_id is not distinct from
        (select o.id from public.hr_vacation_certified_openings o where o.employee_id=p.employee_id
         and o.tenant_id=p.tenant_id and o.effective_cutoff_date<=p_as_of));
$$;

-- Materialize only vested rights during an explicit mutation, never during a read.
create or replace function public.hr_sync_certified_vacation_periods(p_tenant uuid,p_employee uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.hr_vacation_certified_openings; y integer; d date; annual numeric;
  today date := (now() at time zone 'America/Santiago')::date;
begin
  perform 1 from public.hr_employees where id=p_employee and tenant_id=p_tenant for update;
  select * into o from public.hr_vacation_certified_openings where tenant_id=p_tenant and employee_id=p_employee
    and effective_cutoff_date<=today;
  if not found then return; end if;
  insert into public.hr_vacation_periods(tenant_id,employee_id,period_start,period_end,base_days,
    positive_adjustments,negative_adjustments,certified_opening_balance_id,earned_on,status,created_by)
  values(o.tenant_id,o.employee_id,o.effective_cutoff_date,o.effective_cutoff_date,0,
    greatest(o.balance_days,0),greatest(-o.balance_days,0),o.id,o.effective_cutoff_date,'open',o.created_by)
  on conflict(certified_opening_balance_id,earned_on) where certified_opening_balance_id is not null do nothing;
  for y in extract(year from o.effective_cutoff_date)::int..extract(year from today)::int loop
    d := make_date(y,extract(month from o.hire_date)::int,
      least(extract(day from o.hire_date)::int,extract(day from (make_date(y,extract(month from o.hire_date)::int,1)+interval '1 month - 1 day'))::int));
    if d>o.effective_cutoff_date and d<=today and extract(year from age(d,o.hire_date))>=1 then
      annual := public.hr_certified_annual_days(o,d);
      insert into public.hr_vacation_periods(tenant_id,employee_id,period_start,period_end,base_days,progressive_days,
        certified_opening_balance_id,earned_on,status,created_by)
      values(o.tenant_id,o.employee_id,d,d,o.base_days,annual-o.base_days,o.id,d,'open',o.created_by)
      on conflict(certified_opening_balance_id,earned_on) where certified_opening_balance_id is not null do nothing;
    end if;
  end loop;
end $$;

create or replace function public.hr_bind_certified_vacation_request() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  select id into new.certified_opening_balance_id from public.hr_vacation_certified_openings
    where tenant_id=new.tenant_id and employee_id=new.employee_id
    and effective_cutoff_date<=(now() at time zone 'America/Santiago')::date;
  return new;
end $$;
drop trigger if exists hr_bind_certified_vacation_request on public.hr_vacation_requests;
create trigger hr_bind_certified_vacation_request before insert on public.hr_vacation_requests
  for each row execute function public.hr_bind_certified_vacation_request();

-- Absorbed history must not silently reverse into a discarded legacy bucket.
create or replace function public.hr_guard_absorbed_vacation_reversal() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status is distinct from old.status and new.status in ('cancelada','anulada','rechazada')
    and exists(select 1 from public.hr_vacation_certified_openings o
      where o.employee_id=old.employee_id and o.tenant_id=old.tenant_id
      and o.effective_cutoff_date<=(now() at time zone 'America/Santiago')::date
      and old.certified_opening_balance_id is distinct from o.id) then
    raise exception 'legacy_vacation_requires_cutoff_review';
  end if;
  return new;
end $$;
drop trigger if exists hr_guard_absorbed_vacation_reversal on public.hr_vacation_requests;
create trigger hr_guard_absorbed_vacation_reversal before update on public.hr_vacation_requests
  for each row execute function public.hr_guard_absorbed_vacation_reversal();

-- This checks net balance, including a negative opening, before existing FIFO runs.
create or replace function public.hr_guard_certified_vacation_mutation(p_request uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.hr_vacation_requests; opening_id uuid; net numeric; own_reserved numeric;
begin
  select * into r from public.hr_vacation_requests where id=p_request;
  if not r.advance_authorized and exists(select 1 from public.hr_vacation_allocations a
    where a.request_id=r.id and a.allocation_status='reserved'
      and not public.hr_vacation_period_is_vested(a.vacation_period_id,(now() at time zone 'America/Santiago')::date)) then
    raise exception 'unvested_vacation_reservation_requires_review';
  end if;
  perform public.hr_sync_certified_vacation_periods(r.tenant_id,r.employee_id);
  select id into opening_id from public.hr_vacation_certified_openings
    where tenant_id=r.tenant_id and employee_id=r.employee_id
      and effective_cutoff_date<=(now() at time zone 'America/Santiago')::date;
  if opening_id is null then return; end if;
  if r.certified_opening_balance_id is distinct from opening_id then
    raise exception 'legacy_vacation_requires_cutoff_review';
  end if;
  select coalesce(sum(available_balance),0) into net from public.hr_vacation_periods
    where certified_opening_balance_id=opening_id and earned_on<=(now() at time zone 'America/Santiago')::date;
  select coalesce(sum(allocated_days),0) into own_reserved from public.hr_vacation_allocations
    where request_id=r.id and allocation_status='reserved';
  if r.business_days>net+own_reserved and not r.advance_authorized then raise exception 'insufficient_vacation_balance'; end if;
  update public.hr_vacation_requests set previous_balance=net+own_reserved,resulting_balance=net+own_reserved-r.business_days where id=r.id;
end $$;

-- Pure, tenant-scoped read. The caller projects unmaterialized anniversaries as of today.
create or replace function public.hr_certified_vacation_states(p_tenant_id uuid)
returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('opening',to_jsonb(o)||jsonb_build_object('entitlement_changes',
    (select coalesce(jsonb_agg(to_jsonb(c) order by c.effective_from),'[]'::jsonb) from public.hr_vacation_entitlement_changes c where c.opening_id=o.id)), 'periods',
    (select coalesce(jsonb_agg(to_jsonb(p)),'[]'::jsonb) from public.hr_vacation_periods p where p.certified_opening_balance_id=o.id))), '[]'::jsonb)
  from public.hr_vacation_certified_openings o where o.tenant_id=p_tenant_id;
$$;

create or replace function public.hr_record_certified_vacation_entitlement(p_opening_id uuid,p_on date,p_progressive integer,p_previous_years numeric,p_override numeric,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare actor record; opening public.hr_vacation_certified_openings; change_id uuid;
begin
  select * into actor from public.hr_current_vacation_actor();
  select * into opening from public.hr_vacation_certified_openings where id=p_opening_id and tenant_id=actor.tenant_id;
  if not found then raise exception 'certified_opening_not_found';end if;
  if p_on<=(opening.effective_cutoff_date) or p_on<(now() at time zone 'America/Santiago')::date then raise exception 'retroactive_entitlement_change_forbidden';end if;
  insert into public.hr_vacation_entitlement_changes(opening_id,tenant_id,effective_from,progressive_days_current,recognized_previous_years,annual_entitlement_override,reason,created_by)
  values(opening.id,actor.tenant_id,p_on,p_progressive,p_previous_years,p_override,p_reason,actor.user_id) returning id into change_id;
  insert into public.audit_events(actor_role,actor_user_id,company_id,tenant_id,entity_type,entity_id,event_type,after_data)
  values(actor.actor_role,actor.user_id,actor.company_id,actor.tenant_id,'hr_vacation_entitlement_change',change_id,'hr.vacation_entitlement_changed',
    jsonb_build_object('opening_id',opening.id,'effective_from',p_on,'progressive',p_progressive,'override',p_override,'reason',p_reason));
  return change_id;
end $$;

create or replace function public.hr_import_certified_vacation_balances(p_source_file text,p_source_hash text,p_cutoff date,p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor record; item jsonb; employee public.hr_employees; previous numeric; existing public.hr_vacation_certified_openings;
  created integer:=0; skipped integer:=0; opening_id uuid; normalized text;
begin
  select * into actor from public.hr_current_vacation_actor();
  if nullif(trim(p_source_file),'') is null or p_source_hash!~'^[a-f0-9]{64}$' or p_cutoff is null
    or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'invalid_certified_import'; end if;
  if exists(select 1 from jsonb_array_elements(p_rows) i group by upper(regexp_replace(i->>'rut','[.\s-]','','g')) having count(*)>1) then
    raise exception 'duplicate_certified_rut';
  end if;
  for item in select value from jsonb_array_elements(p_rows) order by value->>'rut' loop
    normalized:=upper(regexp_replace(item->>'rut','[.\s-]','','g'));
    if (select count(*) from public.hr_employees e where e.tenant_id=actor.tenant_id
      and upper(regexp_replace(e.rut,'[.\s-]','','g'))=normalized)<>1 then raise exception 'certified_employee_not_found_or_ambiguous'; end if;
    select * into employee from public.hr_employees e where e.tenant_id=actor.tenant_id
      and upper(regexp_replace(e.rut,'[.\s-]','','g'))=normalized for update;
    if employee.status<>'activo' or employee.hire_date is null then raise exception 'certified_employee_invalid'; end if;
    if jsonb_typeof(item->'balance_days')<>'number' or (item->>'balance_days')::numeric<>round((item->>'balance_days')::numeric,4) then raise exception 'certified_days_invalid'; end if;
    select * into existing from public.hr_vacation_certified_openings where tenant_id=actor.tenant_id and employee_id=employee.id;
    if found then
      if existing.source_hash=p_source_hash and existing.effective_cutoff_date=p_cutoff and existing.balance_days=(item->>'balance_days')::numeric
        and existing.source_file=p_source_file and existing.source_row=(item->>'source_row')::int
        and existing.recognized_previous_years is not distinct from (item->>'recognized_previous_years')::numeric
        and existing.override_reason is not distinct from item->>'override_reason'
        and existing.internal_alert is not distinct from item->>'internal_alert'
        and existing.annual_entitlement_override is not distinct from (item->>'annual_entitlement_override')::numeric
        and existing.progressive_days_current=coalesce((item->>'progressive_days_current')::int,0) then skipped:=skipped+1; continue;
      else raise exception 'certified_opening_already_exists'; end if;
    end if;
    select coalesce(sum(available_balance),0) into previous from public.hr_vacation_periods where employee_id=employee.id and tenant_id=actor.tenant_id;
    insert into public.hr_vacation_certified_openings(tenant_id,employee_id,rut,balance_days,effective_cutoff_date,source,source_file,source_hash,source_row,
      hire_date,progressive_days_current,recognized_previous_years,annual_entitlement_override,override_reason,internal_alert,
      previous_operating_balance,absorbed_request_ids,created_by)
    values(actor.tenant_id,employee.id,normalized,(item->>'balance_days')::numeric,p_cutoff,p_source_file,p_source_file,p_source_hash,(item->>'source_row')::int,
      employee.hire_date,coalesce((item->>'progressive_days_current')::int,0),(item->>'recognized_previous_years')::numeric,
      (item->>'annual_entitlement_override')::numeric,item->>'override_reason',item->>'internal_alert',previous,
      array(select id from public.hr_vacation_requests where tenant_id=actor.tenant_id and employee_id=employee.id),actor.user_id)
    returning id into opening_id;
    insert into public.audit_events(actor_role,actor_user_id,company_id,tenant_id,entity_type,entity_id,event_type,before_data,after_data)
    values(actor.actor_role,actor.user_id,actor.company_id,actor.tenant_id,'hr_vacation_certified_opening',opening_id,'hr.vacation_certified_opening_created',
      jsonb_build_object('previous_operating_balance',previous),item||jsonb_build_object('cutoff',p_cutoff,'source_hash',p_source_hash,'source_file',p_source_file));
    created:=created+1;
  end loop;
  return jsonb_build_object('created',created,'skipped',skipped);
end $$;

revoke all on function public.hr_certified_opening_immutable() from public,anon,authenticated,service_role;
revoke all on function public.hr_certified_annual_days(public.hr_vacation_certified_openings,date) from public,anon,authenticated,service_role;
revoke all on function public.hr_vacation_period_is_vested(uuid,date) from public,anon,authenticated,service_role;
revoke all on function public.hr_sync_certified_vacation_periods(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.hr_bind_certified_vacation_request() from public,anon,authenticated,service_role;
revoke all on function public.hr_guard_absorbed_vacation_reversal() from public,anon,authenticated,service_role;
revoke all on function public.hr_guard_certified_vacation_mutation(uuid) from public,anon,authenticated,service_role;
revoke all on function public.hr_certified_vacation_states(uuid) from public,anon,authenticated,service_role;
grant execute on function public.hr_certified_vacation_states(uuid) to authenticated,service_role;
revoke all on function public.hr_import_certified_vacation_balances(text,text,date,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.hr_import_certified_vacation_balances(text,text,date,jsonb) to authenticated;
revoke all on function public.hr_record_certified_vacation_entitlement(uuid,date,integer,numeric,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.hr_record_certified_vacation_entitlement(uuid,date,integer,numeric,numeric,text) to authenticated;

-- Existing transactional RPC, with vested/regime selection and signed-balance guard.
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
  perform public.hr_guard_certified_vacation_mutation(p_request_id);
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
        and public.hr_vacation_period_is_vested(id,(now() at time zone 'America/Santiago')::date)
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

-- Existing transactional RPC, with vested/regime selection and signed-balance guard.
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
  perform public.hr_guard_certified_vacation_mutation(p_request_id);
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
        and public.hr_vacation_period_is_vested(id,(now() at time zone 'America/Santiago')::date)
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
        and certified_opening_balance_id is not distinct from
          (select id from public.hr_vacation_certified_openings where tenant_id=v_request.tenant_id
           and employee_id=v_request.employee_id and effective_cutoff_date<=(now() at time zone 'America/Santiago')::date)
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

revoke execute on function public.hr_reserve_vacation_days(uuid) from public,anon,service_role;
revoke execute on function public.hr_approve_vacation_request(uuid,integer,text) from public,anon,service_role;
grant execute on function public.hr_reserve_vacation_days(uuid) to authenticated;
grant execute on function public.hr_approve_vacation_request(uuid,integer,text) to authenticated;

notify pgrst, 'reload schema';
commit;
