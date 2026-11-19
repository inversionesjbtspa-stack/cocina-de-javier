-- Synthetic fixture only; the runner refuses every non-local target.
do $$
declare
  t uuid:='11111111-0000-4000-8000-000000000001';
  u uuid:='11111111-0000-4000-8000-000000000002';
  worker uuid; opening_id uuid; idx int; result jsonb; again jsonb; total numeric;
  balances numeric[]:=array[31,18.75,23.75,24,25,4,10,306.5];
  hires date[]:=array['2022-11-02'::date,'2024-11-01','2024-11-01','2016-03-01','2006-12-01','2020-07-28','2023-02-11','2022-04-01'];
  before_openings jsonb; before_legacy jsonb; before_movements bigint; future_rejected boolean:=false;
begin
  insert into tenants values(t);
  insert into auth.users values(u);
  for idx in 1..8 loop
    worker:=('11111111-0000-4000-8001-'||lpad(idx::text,12,'0'))::uuid;
    insert into hr_employees(id,tenant_id,rut,full_name,hire_date,status)
    values(worker,t,'FICTICIO-'||idx,'FICTICIO ANUALIDAD '||idx,hires[idx],'activo');
    insert into hr_vacation_certified_openings(tenant_id,employee_id,rut,balance_days,effective_cutoff_date,source_file,source_hash,source_row,
      hire_date,base_days,progressive_days_current,annual_entitlement_override,override_reason,previous_operating_balance,created_by)
    values(t,worker,'FICTICIO-'||idx,balances[idx],'2026-10-16','fixture.xlsx',repeat('f',64),idx,
      hires[idx],15,case when idx in(4,5) then 2 else 0 end,case when idx in(4,5) then 17 else null end,
      case when idx in(4,5) then 'Synthetic explicit override' else null end,balances[idx],u) returning id into opening_id;
    if idx=8 then
      insert into hr_vacation_periods(tenant_id,employee_id,period_start,period_end,base_days,positive_adjustments,used_days,certified_opening_balance_id,earned_on)
      values(t,worker,'2026-10-16','2026-10-16',0,306.5,11,opening_id,'2026-10-16');
    end if;
    insert into hr_vacation_periods(tenant_id,employee_id,period_start,period_end,base_days,status)
    values(t,worker,'2020-01-01','2020-12-31',500,'closed');
  end loop;
  select jsonb_agg(to_jsonb(o) order by id) into before_openings from hr_vacation_certified_openings o where tenant_id=t;
  select jsonb_agg(to_jsonb(p) order by id) into before_legacy from hr_vacation_periods p where tenant_id=t and certified_opening_balance_id is null;
  select count(*) into before_movements from hr_vacation_movements;
  select sum(hr_certified_operating_days(o,'2026-11-18')) into total from hr_vacation_certified_openings o where tenant_id=t;
  if total<>477 then raise exception 'fixture_global_before_%',total; end if;
  result:=hr_materialize_certified_anniversaries(t,null,'2026-11-18');
  if (result->>'created_count')::int<>3 then raise exception 'expected_three_anniversaries_%',result; end if;
  if exists(select 1 from jsonb_array_elements(result->'entitlements') x where x->'balance_before' is distinct from x->'balance_after') then raise exception 'balance_changed'; end if;
  for idx in 1..3 loop
    worker:=('11111111-0000-4000-8001-'||lpad(idx::text,12,'0'))::uuid;
    select sum(hr_certified_operating_days(o,'2026-11-18')) into total from hr_vacation_certified_openings o where employee_id=worker;
    if total<>balances[idx]+15 then raise exception 'individual_balance_changed_%',idx; end if;
  end loop;
  again:=hr_materialize_certified_anniversaries(t,null,'2026-11-18');
  if (again->>'created_count')::int<>0 then raise exception 'repeated_materialization_created_rows'; end if;
  select sum(hr_certified_operating_days(o,'2026-11-18')) into total from hr_vacation_certified_openings o where tenant_id=t;
  if total<>477 then raise exception 'fixture_global_after_%',total; end if;
  if exists(select 1 from hr_vacation_periods where tenant_id=t and earned_on>'2026-11-18') then raise exception 'future_earned'; end if;
  if (select count(*) from hr_vacation_periods where tenant_id=t and earned_on>'2026-10-16')<>3 then raise exception 'unexpected_period_count'; end if;
  for idx in 4..7 loop
    worker:=('11111111-0000-4000-8001-'||lpad(idx::text,12,'0'))::uuid;
    select hr_certified_operating_days(o,'2026-11-18') into total from hr_vacation_certified_openings o where employee_id=worker;
    if total<>balances[idx] then raise exception 'unrelated_opening_changed_%',idx; end if;
  end loop;
  if before_openings is distinct from (select jsonb_agg(to_jsonb(o) order by id) from hr_vacation_certified_openings o where tenant_id=t) then raise exception 'opening_changed'; end if;
  if before_legacy is distinct from (select jsonb_agg(to_jsonb(p) order by id) from hr_vacation_periods p where tenant_id=t and certified_opening_balance_id is null) then raise exception 'legacy_changed'; end if;
  if (select count(*) from hr_vacation_movements)<>before_movements then raise exception 'economic_movement_created'; end if;
  if (select count(*) from audit_events where tenant_id=t and event_type='hr.vacation_anniversary_materialized')<>3 then raise exception 'missing_or_duplicate_audit'; end if;
  begin
    perform hr_materialize_certified_anniversaries(t,null,(now() at time zone 'America/Santiago')::date+1);
  exception when raise_exception then
    if sqlerrm<>'future_anniversary_materialization_forbidden' then raise; end if;
    future_rejected:=true;
  end;
  if not future_rejected then raise exception 'future_date_not_rejected'; end if;
  if has_function_privilege('anon','hr_materialize_certified_anniversaries(uuid,uuid[],date)','EXECUTE')
    or has_function_privilege('authenticated','hr_materialize_certified_anniversaries(uuid,uuid[],date)','EXECUTE')
    or not has_function_privilege('service_role','hr_materialize_certified_anniversaries(uuid,uuid[],date)','EXECUTE') then raise exception 'incorrect_execute_permissions'; end if;
  raise notice 'PASS: 3 entitlements, repeat 0, global 477, individual balances unchanged, future excluded, protected history, service-only access';
end $$;
