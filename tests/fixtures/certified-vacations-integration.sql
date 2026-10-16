-- Exclusively synthetic data in the isolated validation database.
do $$
declare
  tenant_a uuid:='00000000-0000-4000-8000-000000000001';
  tenant_b uuid:='00000000-0000-4000-8000-000000000002';
  actor_id uuid:='00000000-0000-4000-8000-000000000003';
  company_id uuid:='00000000-0000-4000-8000-000000000004';
  employee_a uuid:='00000000-0000-4000-8000-000000000005';
  employee_b uuid:='00000000-0000-4000-8000-000000000006';
  today date:=(now() at time zone 'America/Santiago')::date;
  result jsonb; opening public.hr_vacation_certified_openings; rid uuid; legacy_id uuid:=gen_random_uuid(); total numeric; count_before int;
begin
  insert into tenants values(tenant_a),(tenant_b);
  insert into companies values(company_id);insert into auth.users values(actor_id);
  perform set_config('test.user',actor_id::text,false);perform set_config('test.tenant',tenant_a::text,false);perform set_config('test.company',company_id::text,false);
  insert into hr_employees(id,tenant_id,rut,full_name,hire_date,status) values
    (employee_a,tenant_a,'11111111-1','FICTICIO ALFA','2020-06-01','activo'),
    (employee_b,tenant_b,'22222222-2','FICTICIO BETA','2006-12-01','activo');
  insert into hr_vacation_periods(tenant_id,employee_id,period_start,period_end,base_days) values
    (tenant_a,employee_a,'2020-01-01','2020-12-31',110),
    (tenant_a,employee_a,today+10,today+374,15);
  if public.hr_vacation_period_is_vested((select id from hr_vacation_periods where base_days=15),today) then raise exception 'future_vested';end if;
  insert into hr_vacation_requests(id,tenant_id,employee_id,status,start_date,end_date,business_days)
  values(legacy_id,tenant_a,employee_a,'aprobada',today-20,today-19,2);
  result:=hr_import_certified_vacation_balances('fixture.xlsx',repeat('a',64),today-1,
    jsonb_build_array(jsonb_build_object('rut','11.111.111-1','source_row',4,'balance_days',4)));
  if result->>'created'<>'1' then raise exception 'import_not_created';end if;
  result:=hr_import_certified_vacation_balances('fixture.xlsx',repeat('a',64),today-1,
    jsonb_build_array(jsonb_build_object('rut','11.111.111-1','source_row',4,'balance_days',4)));
  if result->>'skipped'<>'1' then raise exception 'import_not_idempotent';end if;
  select * into opening from hr_vacation_certified_openings where employee_id=employee_a;
  select count(*) into count_before from hr_vacation_periods;
  perform hr_certified_vacation_states(tenant_a);
  perform hr_certified_vacation_states(tenant_a);
  if (select count(*) from hr_vacation_periods)<>count_before or exists(select 1 from hr_vacation_movements) then raise exception 'read_created_vacation_data';end if;
  begin perform hr_cancel_vacation_request(legacy_id,'FICTICIO: historial absorbido');
    raise exception 'absorbed_legacy_reversed';
  exception when raise_exception then if sqlerrm<>'legacy_vacation_requires_cutoff_review' then raise;end if;end;
  if (select status from hr_vacation_requests where id=legacy_id)<>'aprobada' then raise exception 'absorbed_legacy_changed';end if;
  begin update hr_vacation_certified_openings set balance_days=99 where id=opening.id;raise exception 'immutable_failed';
    exception when raise_exception then if sqlerrm<>'certified_opening_is_immutable' then raise;end if;end;
  perform hr_sync_certified_vacation_periods(tenant_a,employee_a);
  select sum(available_balance) into total from hr_vacation_periods where hr_vacation_period_is_vested(id,today) and employee_id=employee_a;
  if total<>4 then raise exception 'opening_expected_4_got_%',total;end if;
  rid:=hr_create_vacation_request(jsonb_build_object('employee_id',employee_a,'start_date',today+20,'end_date',today+22,'business_days',3,'status','solicitada','snapshot','{}'::jsonb));
  perform hr_reserve_vacation_days(rid);
  perform hr_reserve_vacation_days(rid);
  if (select count(*) from hr_vacation_allocations where request_id=rid)<>1 then raise exception 'reservation_duplicate';end if;
  perform hr_approve_vacation_request(rid,null,null);
  select sum(available_balance) into total from hr_vacation_periods where certified_opening_balance_id=opening.id;
  if total<>1 then raise exception 'approved_balance_wrong_%',total;end if;
  perform hr_cancel_vacation_request(rid,'FICTICIO: reversa controlada');
  select sum(available_balance) into total from hr_vacation_periods where certified_opening_balance_id=opening.id;
  if total<>4 then raise exception 'reversal_balance_wrong_%',total;end if;
  begin perform hr_cancel_vacation_request(rid,'duplicate');exception when raise_exception then if sqlerrm<>'vacation_already_cancelled' then raise;end if;end;
  if (select count(*) from hr_vacation_movements where request_id=rid and movement_type='reversa_aprobacion')<>1 then raise exception 'reversal_duplicate';end if;
  if (select balance_days from hr_vacation_certified_openings where id=opening.id)<>4 then raise exception 'opening_changed';end if;
  if (select available_balance from hr_vacation_periods where employee_id=employee_a and base_days=110)<>110 then raise exception 'legacy_changed';end if;
  begin perform hr_import_certified_vacation_balances('bad.xlsx',repeat('b',64),today,
    '[{"rut":"22222222-2","balance_days":10,"source_row":1}]'::jsonb);raise exception 'cross_tenant_allowed';
    exception when raise_exception then if sqlerrm<>'certified_employee_not_found_or_ambiguous' then raise;end if;end;
  perform set_config('test.tenant',tenant_b::text,false);
  perform hr_import_certified_vacation_balances('fixture.xlsx',repeat('b',64),'2025-10-31',
    '[{"rut":"22222222-2","balance_days":25,"source_row":15,"annual_entitlement_override":17,"progressive_days_current":2,"override_reason":"Derecho anual certificado por administracion","internal_alert":"REVISAR ANTECEDENTES DE FERIADO PROGRESIVO"}]'::jsonb);
  select * into opening from hr_vacation_certified_openings where employee_id=employee_b;
  if hr_certified_annual_days(opening,'2026-12-01')<>17 then raise exception 'override_increased_to_18';end if;
  perform hr_sync_certified_vacation_periods(tenant_b,employee_b);perform hr_sync_certified_vacation_periods(tenant_b,employee_b);
  select sum(available_balance) into total from hr_vacation_periods where certified_opening_balance_id=opening.id;
  if total<>42 then raise exception 'anniversary_not_exactly_once_%',total;end if;
  perform set_config('test.tenant',tenant_a::text,false);
end $$;

do $$
declare t uuid:='00000000-0000-4000-8000-000000000001';
  e uuid:='00000000-0000-4000-8000-000000000011'; rid uuid; opening_id uuid; today date:=(now() at time zone 'America/Santiago')::date;
begin
  insert into hr_employees(id,tenant_id,rut,full_name,hire_date,status)
    values(e,t,'77777777-7','FICTICIO FIFO','2020-12-01','activo');
  perform hr_import_certified_vacation_balances('fifo.xlsx',repeat('1',64),'2025-10-31',
    '[{"rut":"77777777-7","balance_days":4,"source_row":1}]'::jsonb);
  perform hr_sync_certified_vacation_periods(t,e);
  select id into opening_id from hr_vacation_certified_openings where employee_id=e;
  rid:=hr_create_vacation_request(jsonb_build_object('employee_id',e,'start_date',today+50,'end_date',today+57,'business_days',6,'status','solicitada'));
  perform hr_approve_vacation_request(rid,null,null);
  if (select allocated_days from hr_vacation_allocations where request_id=rid and allocation_order=1)<>4
    or (select allocated_days from hr_vacation_allocations where request_id=rid and allocation_order=2)<>2
    then raise exception 'certified_fifo_order_wrong';end if;
  if (select sum(available_balance) from hr_vacation_periods where certified_opening_balance_id=opening_id)<>13 then raise exception 'fifo_balance_wrong';end if;
  perform hr_cancel_vacation_request(rid,'FICTICIO: reversa FIFO');
  if (select sum(available_balance) from hr_vacation_periods where certified_opening_balance_id=opening_id)<>19 then raise exception 'fifo_reversal_wrong';end if;
end $$;

set role authenticated;
do $$ begin
  if (select count(*) from hr_vacation_certified_openings)<>2
    or exists(select 1 from hr_vacation_certified_openings where tenant_id<>current_setting('test.tenant')::uuid)
    then raise exception 'rls_tenant_leak';end if;
  if has_function_privilege('anon','public.hr_import_certified_vacation_balances(text,text,date,jsonb)','EXECUTE') then raise exception 'anon_rpc_grant';end if;
  if has_function_privilege('anon','public.hr_reserve_vacation_days(uuid)','EXECUTE')
    or has_function_privilege('anon','public.hr_approve_vacation_request(uuid,integer,text)','EXECUTE') then raise exception 'anon_mutation_grant';end if;
  if has_table_privilege('authenticated','public.hr_vacation_certified_openings','UPDATE') then raise exception 'opening_update_grant';end if;
end $$;
reset role;

do $$
declare t uuid:='00000000-0000-4000-8000-000000000001'; e uuid:='00000000-0000-4000-8000-000000000007';
  n uuid:='00000000-0000-4000-8000-000000000008'; f uuid:='00000000-0000-4000-8000-000000000009';
  z uuid:='00000000-0000-4000-8000-000000000010'; today date:=(now() at time zone 'America/Santiago')::date;
  o public.hr_vacation_certified_openings; rid uuid; amount numeric;
begin
  insert into hr_employees(id,tenant_id,rut,full_name,hire_date,status) values
    (e,t,'33333333-3','FICTICIO NEGATIVO','2020-07-28','activo'),
    (n,t,'44444444-4','FICTICIO FUTURO','2020-06-01','activo'),
    (f,t,'55555555-5','FICTICIO DECIMAL','2016-03-01','activo'),
    (z,t,'66666666-6','FICTICIO ROLLBACK','2020-06-01','activo');
  perform hr_import_certified_vacation_balances('negative.xlsx',repeat('c',64),today,
    '[{"rut":"33333333-3","balance_days":-1.25,"source_row":9}]'::jsonb);
  perform hr_sync_certified_vacation_periods(t,e);
  select sum(available_balance) into amount from hr_vacation_periods where employee_id=e;
  if amount<>-1.25 then raise exception 'negative_lost';end if;
  perform hr_import_certified_vacation_balances('future.xlsx',repeat('d',64),today+15,
    '[{"rut":"44444444-4","balance_days":27.50,"source_row":6}]'::jsonb);
  perform hr_sync_certified_vacation_periods(t,n);
  if exists(select 1 from hr_vacation_periods where employee_id=n) then raise exception 'future_materialized';end if;
  if (select is_active from hr_vacation_certified_opening_state where employee_id=n) then raise exception 'future_activated';end if;
  perform hr_import_certified_vacation_balances('decimal.xlsx',repeat('e',64),today,
    '[{"rut":"55555555-5","balance_days":17.25,"source_row":6,"progressive_days_current":2,"annual_entitlement_override":17,"override_reason":"Fixture autorizado"}]'::jsonb);
  select * into o from hr_vacation_certified_openings where employee_id=f;
  if o.balance_days<>17.25 or hr_certified_annual_days(o,'2027-03-01')<>17 then raise exception 'decimal_or_override_corrupt';end if;
  perform hr_record_certified_vacation_entitlement(o.id,today+1,3,null,18,'FICTICIO: cambio prospectivo documentado');
  if hr_certified_annual_days(o,today)<>17 or hr_certified_annual_days(o,today+1)<>18 then raise exception 'entitlement_version_wrong';end if;
  if (select balance_days from hr_vacation_certified_openings where id=o.id)<>17.25 then raise exception 'entitlement_rewrote_opening';end if;
  begin perform hr_record_certified_vacation_entitlement(o.id,today-1,3,null,18,'retroactivo');
    raise exception 'retroactive_allowed';
  exception when raise_exception then if sqlerrm<>'retroactive_entitlement_change_forbidden' then raise;end if;end;
  begin
    insert into hr_vacation_periods(tenant_id,employee_id,period_start,period_end,base_days,certified_opening_balance_id,earned_on)
    values(t,z,today,today,15,o.id,today);
    raise exception 'cross_worker_period_allowed';
  exception when foreign_key_violation then null;end;
  begin
    perform hr_import_certified_vacation_balances('rollback.xlsx',repeat('f',64),today,
      '[{"rut":"66666666-6","balance_days":10,"source_row":1},{"rut":"99999999-9","balance_days":5,"source_row":2}]'::jsonb);
    raise exception 'unknown_worker_allowed';
  exception when raise_exception then if sqlerrm<>'certified_employee_not_found_or_ambiguous' then raise;end if;end;
  if exists(select 1 from hr_vacation_certified_openings where employee_id=z) then raise exception 'partial_import';end if;
  rid:=hr_create_vacation_request(jsonb_build_object('employee_id',e,'start_date',today+30,'end_date',today+31,'business_days',1,'status','solicitada'));
  begin perform hr_approve_vacation_request(rid,null,null);raise exception 'negative_can_spend';
  exception when raise_exception then if sqlerrm<>'insufficient_vacation_balance' then raise;end if;end;
end $$;
