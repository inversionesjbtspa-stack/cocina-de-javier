begin;

-- One auditable credit per historical request. Never reverse its absorbed legacy allocation.
create unique index if not exists hr_vacation_admin_credit_request_uidx
  on public.hr_vacation_movements(request_id)
  where movement_type='administrative_cancellation_credit';

create or replace function public.hr_guard_administrative_vacation_credit() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if old.movement_type='administrative_cancellation_credit' then
    raise exception 'administrative_vacation_credit_is_immutable';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists hr_guard_administrative_vacation_credit on public.hr_vacation_movements;
create trigger hr_guard_administrative_vacation_credit before update or delete on public.hr_vacation_movements
  for each row execute function public.hr_guard_administrative_vacation_credit();

create or replace function public.hr_credit_administrative_vacation_cancellation(p_request_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  actor record; req public.hr_vacation_requests; opening public.hr_vacation_certified_openings;
  cancellation public.hr_vacation_administrative_cancellations;
  credit public.hr_vacation_movements; bucket public.hr_vacation_periods;
  before_balance numeric; after_balance numeric; credit_days numeric;
  today date := (now() at time zone 'America/Santiago')::date;
begin
  select * into actor from public.hr_current_vacation_actor();
  if actor.user_id is null then raise exception 'unauthorized'; end if;
  if actor.actor_role::text not in ('owner','admin','finance_manager') then raise exception 'hr_forbidden'; end if;
  if p_reason is null or length(trim(p_reason)) not between 1 and 800 then raise exception 'administrative_cancel_reason_required'; end if;
  select * into req from public.hr_vacation_requests where id=p_request_id and tenant_id=actor.tenant_id for update;
  if not found then raise exception 'vacation_not_found'; end if;
  select * into opening from public.hr_vacation_certified_openings where employee_id=req.employee_id
    and tenant_id=actor.tenant_id and effective_cutoff_date<=today;
  if not found then raise exception 'vacation_not_absorbed_history'; end if;
  if req.certified_opening_balance_id is not distinct from opening.id or not(req.id=any(opening.absorbed_request_ids))
    or req.end_date is null or req.end_date>opening.effective_cutoff_date then raise exception 'vacation_not_absorbed_history'; end if;
  select * into cancellation from public.hr_vacation_administrative_cancellations
    where request_id=req.id and tenant_id=actor.tenant_id and opening_id=opening.id;
  if not found then raise exception 'administrative_cancellation_required'; end if;
  credit_days:=req.business_days;
  if credit_days is null or credit_days<=0 then raise exception 'administrative_credit_invalid_days'; end if;
  select * into credit from public.hr_vacation_movements where request_id=req.id
    and movement_type='administrative_cancellation_credit';
  if found then
    if credit.tenant_id<>actor.tenant_id or credit.employee_id<>req.employee_id or credit.days<>credit_days
      or credit.source is distinct from 'administrative_cancellation'
      or not exists(select 1 from public.hr_vacation_periods where id=credit.vacation_period_id and certified_opening_balance_id=opening.id) then
      raise exception 'administrative_prior_credit_requires_review';
    end if;
    return jsonb_build_object('movement_id',credit.id,'days',credit.days,'balance_before',credit.previous_balance,
      'balance_after',credit.resulting_balance,'already_credited',true,'applied_days',0);
  end if;
  if exists(select 1 from public.hr_vacation_movements m where m.request_id=req.id and m.days>0
    and (m.source='administrative_cancellation' or exists(select 1 from public.hr_vacation_periods p
      where p.id=m.vacation_period_id and p.certified_opening_balance_id=opening.id))) then
    raise exception 'administrative_prior_credit_requires_review';
  end if;

  -- Explicit financial mutation: materialize current certified rights, not legacy periods.
  perform public.hr_sync_certified_vacation_periods(actor.tenant_id,req.employee_id);
  perform 1 from public.hr_vacation_periods where certified_opening_balance_id=opening.id and earned_on<=today
    order by earned_on,id for update;
  select * into strict bucket from public.hr_vacation_periods where certified_opening_balance_id=opening.id
    and earned_on=opening.effective_cutoff_date for update;
  select sum(available_balance) into before_balance from public.hr_vacation_periods
    where certified_opening_balance_id=opening.id and earned_on<=today;
  update public.hr_vacation_periods set positive_adjustments=positive_adjustments+credit_days,
    version=version+1,updated_by=actor.user_id,updated_at=now() where id=bucket.id;
  after_balance:=before_balance+credit_days;
  insert into public.hr_vacation_movements(tenant_id,employee_id,vacation_period_id,request_id,movement_type,
    days,previous_balance,resulting_balance,created_by,effective_date,source,source_reference,notes,metadata)
  values(actor.tenant_id,req.employee_id,bucket.id,req.id,'administrative_cancellation_credit',credit_days,
    before_balance,after_balance,actor.user_id,today,'administrative_cancellation',cancellation.receipt_id,trim(p_reason),
    jsonb_build_object('opening_id',opening.id,'administrative_cancellation_id',cancellation.id,
      'receipt_id',cancellation.receipt_id,'balance_effect',credit_days)) returning * into credit;
  insert into public.audit_events(tenant_id,company_id,actor_user_id,actor_role,entity_type,entity_id,event_type,before_data,after_data)
  values(actor.tenant_id,actor.company_id,actor.user_id,actor.actor_role,'hr_vacation_request',req.id,
    'hr_vacation_administrative_cancellation_credit',jsonb_build_object('balance',before_balance),
    jsonb_build_object('worker_id',req.employee_id,'request_id',req.id,'receipt_id',cancellation.receipt_id,
      'movement_id',credit.id,'days',credit_days,'balance_effect',credit_days,'balance_before',before_balance,'balance_after',after_balance,
      'reason',trim(p_reason),'created_by',actor.user_id,'created_at',credit.created_at,'source','administrative_cancellation'));
  return jsonb_build_object('movement_id',credit.id,'days',credit_days,'balance_before',before_balance,
    'balance_after',after_balance,'already_credited',false,'applied_days',credit_days);
end $$;

-- Existing two-argument RPC remains the compatible zero-effect administrative operation.
-- New callers must explicitly supply a boolean; absence is NOT an implicit decision.
create or replace function public.hr_administratively_cancel_vacation_request(p_request_id uuid,p_reason text,p_return_days boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; credit jsonb;
begin
  if p_return_days is null then raise exception 'administrative_return_mode_required'; end if;
  result:=public.hr_administratively_cancel_vacation_request(p_request_id,p_reason);
  if p_return_days then
    credit:=public.hr_credit_administrative_vacation_cancellation(p_request_id,p_reason);
    return result||jsonb_build_object('credit',credit,'balance_effect',(credit->>'applied_days')::numeric);
  end if;
  return result||jsonb_build_object('balance_effect',0);
end $$;
revoke all on function public.hr_guard_administrative_vacation_credit() from public,anon,authenticated,service_role;
revoke all on function public.hr_credit_administrative_vacation_cancellation(uuid,text) from public,anon,service_role;
grant execute on function public.hr_credit_administrative_vacation_cancellation(uuid,text) to authenticated;
revoke all on function public.hr_administratively_cancel_vacation_request(uuid,text,boolean) from public,anon,service_role;
grant execute on function public.hr_administratively_cancel_vacation_request(uuid,text,boolean) to authenticated;
notify pgrst, 'reload schema';
commit;
