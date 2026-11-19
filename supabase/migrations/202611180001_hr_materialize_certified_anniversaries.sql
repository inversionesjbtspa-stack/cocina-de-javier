begin;

-- Same persisted-or-virtual substitution as buildCertifiedVacationPeriods.
create or replace function public.hr_certified_operating_days(
  p_opening public.hr_vacation_certified_openings, p_on date
) returns numeric language sql stable set search_path=public,pg_temp as $$
  with anniversaries as (
    select make_date(y,extract(month from p_opening.hire_date)::int,
      least(extract(day from p_opening.hire_date)::int,
        extract(day from (make_date(y,extract(month from p_opening.hire_date)::int,1)+interval '1 month - 1 day'))::int)) as earned
    from generate_series(extract(year from p_opening.effective_cutoff_date)::int,extract(year from p_on)::int) y
  ), expected as (
    select p_opening.effective_cutoff_date as earned,p_opening.balance_days as days
    where p_opening.effective_cutoff_date<=p_on
    union all
    select earned,public.hr_certified_annual_days(p_opening,earned) from anniversaries
    where earned>p_opening.effective_cutoff_date and earned<=p_on
      and extract(year from age(earned,p_opening.hire_date))>=1
  )
  select coalesce(sum(coalesce(p.available_balance,e.days)),0)
  from expected e left join public.hr_vacation_periods p
    on p.certified_opening_balance_id=p_opening.id and p.earned_on=e.earned;
$$;
revoke all on function public.hr_certified_operating_days(public.hr_vacation_certified_openings,date)
  from public,anon,authenticated,service_role;

create or replace function public.hr_materialize_certified_anniversaries(
  p_tenant_id uuid, p_employee_ids uuid[] default null, p_as_of date default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  today date:=(now() at time zone 'America/Santiago')::date;
  on_date date:=coalesce(p_as_of,today);
  o public.hr_vacation_certified_openings;
  y integer; earned date; annual numeric; balance_before numeric; balance_after numeric;
  period_id uuid; created_count integer:=0; materialized jsonb:='[]'::jsonb;
begin
  if p_tenant_id is null then raise exception 'tenant_required'; end if;
  if on_date>today then raise exception 'future_anniversary_materialization_forbidden'; end if;
  if p_employee_ids is not null and cardinality(p_employee_ids)=0 then
    return jsonb_build_object('created_count',0,'entitlements',materialized,'as_of',on_date);
  end if;

  for o in select * from public.hr_vacation_certified_openings
    where tenant_id=p_tenant_id and effective_cutoff_date<=on_date
      and (p_employee_ids is null or employee_id=any(p_employee_ids)) order by employee_id
  loop
    -- Coordinate with normal certified mutations, including the original sync.
    perform 1 from public.hr_employees where id=o.employee_id and tenant_id=p_tenant_id for update;
    perform 1 from public.hr_vacation_periods where certified_opening_balance_id=o.id order by earned_on for update;
    balance_before:=public.hr_certified_operating_days(o,on_date);

    for y in extract(year from o.effective_cutoff_date)::int..extract(year from on_date)::int loop
      earned:=make_date(y,extract(month from o.hire_date)::int,
        least(extract(day from o.hire_date)::int,
          extract(day from (make_date(y,extract(month from o.hire_date)::int,1)+interval '1 month - 1 day'))::int));
      if earned<=o.effective_cutoff_date or earned>on_date or extract(year from age(earned,o.hire_date))<1 then continue; end if;
      if exists(select 1 from public.hr_vacation_periods where certified_opening_balance_id=o.id and earned_on=earned) then continue; end if;
      annual:=public.hr_certified_annual_days(o,earned);
      period_id:=null;
      insert into public.hr_vacation_periods(tenant_id,employee_id,period_start,period_end,base_days,progressive_days,
        certified_opening_balance_id,earned_on,status,created_by)
      values(o.tenant_id,o.employee_id,earned,earned,o.base_days,annual-o.base_days,o.id,earned,'open',auth.uid())
      on conflict(certified_opening_balance_id,earned_on) where certified_opening_balance_id is not null do nothing
      returning id into period_id;
      if period_id is null then continue; end if;

      balance_after:=public.hr_certified_operating_days(o,on_date);
      if balance_after is distinct from balance_before then raise exception 'anniversary_materialization_changed_balance'; end if;
      insert into public.audit_events(tenant_id,actor_user_id,entity_type,entity_id,event_type,before_data,after_data)
      values(o.tenant_id,auth.uid(),'hr_vacation_period',period_id,'hr.vacation_anniversary_materialized',
        jsonb_build_object('operating_balance',balance_before,'virtual',true),
        jsonb_build_object('opening_id',o.id,'employee_id',o.employee_id,'earned_on',earned,'days',annual,
          'operating_balance',balance_after,'economic_delta',0,'source','anniversary_materialization'));
      created_count:=created_count+1;
      materialized:=materialized||jsonb_build_array(jsonb_build_object('id',period_id,'employee_id',o.employee_id,
        'earned_on',earned,'days',annual,'balance_before',balance_before,'balance_after',balance_after));
    end loop;
    if public.hr_certified_operating_days(o,on_date) is distinct from balance_before then
      raise exception 'anniversary_materialization_changed_balance';
    end if;
  end loop;
  return jsonb_build_object('created_count',created_count,'entitlements',materialized,'as_of',on_date);
end $$;

revoke all on function public.hr_materialize_certified_anniversaries(uuid,uuid[],date)
  from public,anon,authenticated,service_role;
grant execute on function public.hr_materialize_certified_anniversaries(uuid,uuid[],date) to service_role;

notify pgrst,'reload schema';

commit;
