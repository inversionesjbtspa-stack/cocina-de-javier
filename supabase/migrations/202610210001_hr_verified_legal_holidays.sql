begin;
-- Official national calendar, not the former partial development fixture.
-- https://www.gob.cl/noticias/feriados-2026-revisa-cuantos-habra-y-cuales-son-irrenunciables/
insert into public.hr_holiday_calendar(holiday_date,name,scope,mandatory,source_name,source_reference,verified_at,status)
select d::date,n,'national',m,'Gobierno de Chile',
 'https://www.gob.cl/noticias/feriados-2026-revisa-cuantos-habra-y-cuales-son-irrenunciables/',now(),'active'
from (values
 ('2026-01-01','Ano Nuevo',true),('2026-04-03','Viernes Santo',false),('2026-04-04','Sabado Santo',false),
 ('2026-05-01','Dia Nacional del Trabajo',true),('2026-05-21','Glorias Navales',false),
 ('2026-06-21','Dia Nacional de los Pueblos Indigenas',false),('2026-06-29','San Pedro y San Pablo',false),
 ('2026-07-16','Virgen del Carmen',false),('2026-08-15','Asuncion de la Virgen',false),
 ('2026-09-18','Independencia Nacional',true),('2026-09-19','Glorias del Ejercito',true),
 ('2026-10-12','Encuentro de Dos Mundos',false),('2026-10-31','Iglesias Evangelicas y Protestantes',false),
 ('2026-11-01','Dia de Todos los Santos',false),('2026-12-08','Inmaculada Concepcion',false),('2026-12-25','Navidad',true)
) expected(d,n,m)
where not exists(select 1 from public.hr_holiday_calendar h where h.tenant_id is null and h.scope='national'
 and h.holiday_date=d::date and h.status='active');

insert into public.hr_holiday_calendar_years(calendar_year,verification_status,verified_at,source_name,source_reference)
select 2026,'verified',now(),'Gobierno de Chile','Calendario nacional 2026; gob.cl/noticias/feriados-2026-revisa-cuantos-habra-y-cuales-son-irrenunciables/'
where not exists(select 1 from public.hr_holiday_calendar_years where tenant_id is null and calendar_year=2026 and region_code is null and commune_code is null);
update public.hr_holiday_calendar_years set verification_status='verified',verified_at=now(),source_name='Gobierno de Chile',
 source_reference='https://www.gob.cl/noticias/feriados-2026-revisa-cuantos-habra-y-cuales-son-irrenunciables/',updated_at=now()
where tenant_id is null and calendar_year=2026 and region_code is null and commune_code is null and verification_status<>'verified';

-- Independent database contract guard; API preview uses calculateLegalVacationDays
-- over these same persisted dates, and receipts consume the persisted result.
create or replace function public.hr_legal_vacation_business_days(p_tenant uuid,p_start date,p_end date,p_manual date[] default '{}')
returns integer language sql stable security invoker set search_path=public,pg_temp as $$
 select count(*)::int from generate_series(p_start,p_end,interval '1 day') day_value
 where extract(isodow from day_value)<6 and not(day_value::date=any(coalesce(p_manual,'{}')))
 and not exists(select 1 from public.hr_holiday_calendar h where h.holiday_date=day_value::date and h.status='active'
   and (h.tenant_id is null or h.tenant_id=p_tenant) and h.scope in ('national','tenant'));
$$;
create or replace function public.hr_guard_legal_vacation_days() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare expected integer; manual_dates date[];
begin
 if new.status not in ('solicitada','pendiente','aprobada','en_curso','finalizada') then return new; end if;
 if exists(select 1 from generate_series(extract(year from new.start_date)::int,extract(year from coalesce(new.effective_rest_end_date,new.end_date))::int) y
   where not exists(select 1 from public.hr_holiday_calendar_years c where c.calendar_year=y and c.verification_status='verified'
     and (c.tenant_id is null or c.tenant_id=new.tenant_id) and c.region_code is null and c.commune_code is null)) then
   raise exception 'holiday_calendar_not_verified';
 end if;
 select coalesce(array_agg(value::date),'{}') into manual_dates from jsonb_array_elements_text(coalesce(new.snapshot#>'{workCalendar,non_business,manualNonWorkingDayDates}','[]'));
 expected:=public.hr_legal_vacation_business_days(new.tenant_id,new.start_date,coalesce(new.effective_rest_end_date,new.end_date),manual_dates);
 if new.business_days is distinct from expected::numeric then raise exception 'vacation_legal_days_mismatch'; end if;
 return new;
end $$;
drop trigger if exists hr_guard_legal_vacation_days on public.hr_vacation_requests;
create trigger hr_guard_legal_vacation_days before insert or update of business_days,start_date,end_date,status on public.hr_vacation_requests
 for each row execute function public.hr_guard_legal_vacation_days();
revoke all on function public.hr_legal_vacation_business_days(uuid,date,date,date[]) from public,anon,authenticated,service_role;
revoke all on function public.hr_guard_legal_vacation_days() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
