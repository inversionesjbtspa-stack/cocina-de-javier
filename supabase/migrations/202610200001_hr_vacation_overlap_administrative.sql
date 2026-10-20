begin;

-- Canonical overlap predicate for preview, reservation and approval. Administrative
-- cancellation is an overlay; the absorbed request's original status is immutable.
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
      and request.status in ('solicitada', 'pendiente', 'aprobada', 'en_curso', 'finalizada')
      and (p_exclude_request_id is null or request.id <> p_exclude_request_id)
      and request.start_date <= p_end_date
      and request.end_date >= p_start_date
      and not exists (
        select 1 from public.hr_vacation_administrative_cancellations cancellation
        where cancellation.request_id = request.id
          and cancellation.tenant_id = request.tenant_id
          and cancellation.employee_id = request.employee_id
      )
  );
$$;

-- The public entry point derives tenant/role from the session, never from the caller.
create or replace function public.hr_preview_vacation_overlap(
  p_employee_id uuid, p_start_date date, p_end_date date
) returns boolean
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor record;
begin
  select * into actor from public.hr_current_vacation_actor();
  if actor.user_id is null then raise exception 'unauthorized'; end if;
  if actor.actor_role::text not in ('owner','admin','finance_manager') then raise exception 'hr_forbidden'; end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_vacation_date_range';
  end if;
  if not exists(select 1 from public.hr_employees where id = p_employee_id and tenant_id = actor.tenant_id) then
    raise exception 'employee_not_found';
  end if;
  return public.hr_vacation_has_overlap(actor.tenant_id, p_employee_id, p_start_date, p_end_date, null);
end;
$$;

revoke all on function public.hr_vacation_has_overlap(uuid,uuid,date,date,uuid) from public,anon,authenticated,service_role;
revoke all on function public.hr_preview_vacation_overlap(uuid,date,date) from public,anon,service_role;
grant execute on function public.hr_preview_vacation_overlap(uuid,date,date) to authenticated;
notify pgrst, 'reload schema';
commit;
