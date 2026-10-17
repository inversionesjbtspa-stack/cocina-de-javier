begin;

create or replace function public.hr_require_certified_vacation_request()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare today date := (now() at time zone 'America/Santiago')::date;
begin
  if today < date '2026-10-16' then return new; end if;
  if tg_op='UPDATE' then
    if new.status is not distinct from old.status or new.status not in ('pendiente','aprobada') then return new; end if;
  end if;
  if not exists(select 1 from public.hr_vacation_certified_openings o
    where o.tenant_id=new.tenant_id and o.employee_id=new.employee_id and o.effective_cutoff_date<=today)
    then raise exception 'certified_vacation_balance_required'; end if;
  return new;
end $$;

drop trigger if exists hr_require_certified_vacation_request on public.hr_vacation_requests;
create trigger hr_require_certified_vacation_request before insert or update of status on public.hr_vacation_requests
  for each row execute function public.hr_require_certified_vacation_request();

revoke all on function public.hr_require_certified_vacation_request() from public,anon,authenticated,service_role;
commit;
