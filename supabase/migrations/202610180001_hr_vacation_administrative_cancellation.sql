begin;

-- Administrative overlay only: original financial status, FIFO and PDF remain immutable history.
create table if not exists public.hr_vacation_administrative_cancellations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  employee_id uuid not null references public.hr_employees(id),
  request_id uuid not null unique references public.hr_vacation_requests(id),
  opening_id uuid not null,
  receipt_id text not null,
  administrative_cancelled_at timestamptz not null default now(),
  administrative_cancelled_by uuid not null references auth.users(id),
  administrative_cancel_reason text not null check (length(trim(administrative_cancel_reason)) between 1 and 800),
  balance_before numeric(12,4) not null,
  balance_after numeric(12,4) not null,
  balance_effect numeric(12,4) not null default 0 check (balance_effect = 0),
  check (balance_before = balance_after),
  foreign key (opening_id,tenant_id,employee_id)
    references public.hr_vacation_certified_openings(id,tenant_id,employee_id)
);
create index if not exists hr_vacation_admin_cancel_tenant_employee_idx
  on public.hr_vacation_administrative_cancellations(tenant_id,employee_id);
alter table public.hr_vacation_administrative_cancellations enable row level security;
revoke all on public.hr_vacation_administrative_cancellations from public,anon,authenticated,service_role;
grant select on public.hr_vacation_administrative_cancellations to authenticated,service_role;
drop policy if exists hr_vacation_admin_cancel_read on public.hr_vacation_administrative_cancellations;
create policy hr_vacation_admin_cancel_read on public.hr_vacation_administrative_cancellations for select to authenticated
  using (public.current_user_has_role(tenant_id,array['owner','admin','finance_manager']::public.app_role[]));
drop trigger if exists hr_vacation_admin_cancel_immutable on public.hr_vacation_administrative_cancellations;
create trigger hr_vacation_admin_cancel_immutable before update or delete on public.hr_vacation_administrative_cancellations
  for each row execute function public.hr_certified_opening_immutable();

create or replace function public.hr_administratively_cancel_vacation_request(p_request_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor record; req public.hr_vacation_requests; opening public.hr_vacation_certified_openings;
  existing public.hr_vacation_administrative_cancellations;
  available numeric;
  today date := (now() at time zone 'America/Santiago')::date;
begin
  select * into actor from public.hr_current_vacation_actor();
  if actor.user_id is null then raise exception 'unauthorized'; end if;
  if actor.actor_role::text not in ('owner','admin','finance_manager') then raise exception 'hr_forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 800 then raise exception 'administrative_cancel_reason_required'; end if;
  select * into req from public.hr_vacation_requests where id=p_request_id and tenant_id=actor.tenant_id for update;
  if not found then raise exception 'vacation_not_found'; end if;
  select * into opening from public.hr_vacation_certified_openings
    where employee_id=req.employee_id and tenant_id=actor.tenant_id and effective_cutoff_date<=today;
  if not found then raise exception 'vacation_not_absorbed_history'; end if;
  if req.certified_opening_balance_id is not distinct from opening.id
    or not (req.id=any(opening.absorbed_request_ids)) or req.end_date>opening.effective_cutoff_date then
    raise exception 'vacation_not_absorbed_history';
  end if;
  select * into existing from public.hr_vacation_administrative_cancellations where request_id=req.id;
  if found then return to_jsonb(existing)||jsonb_build_object('already_cancelled',true,'status','anulada_administrativamente'); end if;
  if req.status not in ('aprobada','solicitada','pendiente','borrador') then raise exception 'vacation_not_administratively_cancellable'; end if;

  -- One coherent read-only snapshot of certified buckets, without materializing periods.
  with anniversaries as (
    select make_date(y,extract(month from opening.hire_date)::int,
      least(extract(day from opening.hire_date)::int,extract(day from (make_date(y,extract(month from opening.hire_date)::int,1)+interval '1 month - 1 day'))::int)) earned
    from generate_series(extract(year from opening.effective_cutoff_date)::int,extract(year from today)::int) y
  ), buckets as (
    select opening.effective_cutoff_date earned,opening.balance_days entitlement
    union all
    select earned,public.hr_certified_annual_days(opening,earned) from anniversaries
      where earned>opening.effective_cutoff_date and earned<=today and extract(year from age(earned,opening.hire_date))>=1
  )
  select sum(coalesce(p.available_balance,b.entitlement)) into available from buckets b
    left join public.hr_vacation_periods p on p.certified_opening_balance_id=opening.id and p.earned_on=b.earned;
  insert into public.hr_vacation_administrative_cancellations(tenant_id,employee_id,request_id,opening_id,receipt_id,
    administrative_cancelled_by,administrative_cancel_reason,balance_before,balance_after)
  values(actor.tenant_id,req.employee_id,req.id,opening.id,coalesce(req.document_number,req.receipt_number,req.id::text),
    actor.user_id,trim(p_reason),available,available) returning * into existing;
  insert into public.audit_events(tenant_id,company_id,actor_user_id,actor_role,entity_type,entity_id,event_type,before_data,after_data)
  values(actor.tenant_id,actor.company_id,actor.user_id,actor.actor_role,'hr_vacation_request',req.id,
    'hr_vacation_administratively_cancelled',jsonb_build_object('status',req.status,'balance',available),
    to_jsonb(existing)||jsonb_build_object('worker_id',req.employee_id,'status','anulada_administrativamente'));
  return to_jsonb(existing)||jsonb_build_object('already_cancelled',false,'status','anulada_administrativamente');
end $$;
revoke all on function public.hr_administratively_cancel_vacation_request(uuid,text) from public,anon,service_role;
grant execute on function public.hr_administratively_cancel_vacation_request(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
