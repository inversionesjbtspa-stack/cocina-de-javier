begin;
create table if not exists public.hr_vacation_holiday_corrections(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 request_id uuid not null unique references public.hr_vacation_requests(id), employee_id uuid not null references public.hr_employees(id),
 movement_id uuid not null references public.hr_vacation_movements(id), days_returned numeric not null check(days_returned>0),
 old_business_days numeric not null,new_business_days numeric not null, balance_before numeric not null,balance_after numeric not null,
 reason text not null, corrected_by uuid not null references auth.users(id),corrected_at timestamptz not null default now(),
 previous_document jsonb not null,before_request jsonb not null,before_allocation jsonb not null,before_period jsonb not null,
 new_hash text,new_path text,document_completed_at timestamptz,
 check(old_business_days-new_business_days=days_returned),check(balance_after-balance_before=days_returned)
);
alter table public.hr_vacation_holiday_corrections enable row level security;
revoke all on public.hr_vacation_holiday_corrections from public,anon,authenticated,service_role;
grant select on public.hr_vacation_holiday_corrections to authenticated,service_role;
drop policy if exists hr_holiday_correction_read on public.hr_vacation_holiday_corrections;
create policy hr_holiday_correction_read on public.hr_vacation_holiday_corrections for select to authenticated
 using(public.current_user_has_role(tenant_id,array['owner','admin','finance_manager']::public.app_role[]));
create unique index if not exists hr_holiday_credit_request_uidx on public.hr_vacation_movements(request_id) where movement_type='legal_holiday_correction_credit';

create or replace function public.hr_correct_vacation_legal_holidays(p_request uuid,p_expected_version integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor record; r public.hr_vacation_requests; a public.hr_vacation_allocations; p public.hr_vacation_periods;
 d public.hr_vacation_documents; c public.hr_vacation_holiday_corrections; correct_days integer; delta numeric;
 before_r jsonb;before_a jsonb;before_p jsonb; snap jsonb; legal_dates jsonb; manual_dates date[]; movement uuid; allocations jsonb; total_after numeric;
begin
 select * into actor from public.hr_current_vacation_actor();
 if actor.user_id is null then raise exception 'unauthorized'; end if;
 if actor.actor_role::text not in ('owner','admin','finance_manager') then raise exception 'hr_forbidden'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 800 then raise exception 'correction_reason_required'; end if;
 select * into r from public.hr_vacation_requests where id=p_request and tenant_id=actor.tenant_id for update;
 if not found then raise exception 'vacation_not_found'; end if;
 select * into c from public.hr_vacation_holiday_corrections where request_id=r.id;
 if found then return to_jsonb(c)||jsonb_build_object('already_corrected',true,'applied_days',0); end if;
 if r.status<>'aprobada' or r.version<>p_expected_version or exists(select 1 from public.hr_vacation_administrative_cancellations where request_id=r.id) then raise exception 'holiday_correction_requires_review'; end if;
 if r.certified_opening_balance_id is null or exists(select 1 from public.hr_vacation_certified_openings where id=r.certified_opening_balance_id and r.id=any(absorbed_request_ids)) then raise exception 'holiday_correction_requires_review'; end if;
 select coalesce(array_agg(value::date),'{}') into manual_dates from jsonb_array_elements_text(coalesce(r.snapshot#>'{workCalendar,non_business,manualNonWorkingDayDates}','[]'));
 correct_days:=public.hr_legal_vacation_business_days(r.tenant_id,r.start_date,coalesce(r.effective_rest_end_date,r.end_date),manual_dates);
 delta:=r.business_days-correct_days;
 if delta<=0 or correct_days<=0 then raise exception 'no_holiday_correction_required'; end if;
 if (select count(*) from public.hr_vacation_allocations where request_id=r.id and allocation_status='consumed')<>1
   or exists(select 1 from public.hr_vacation_movements where request_id=r.id and days>0) then raise exception 'holiday_correction_requires_review'; end if;
 select * into strict a from public.hr_vacation_allocations where request_id=r.id and allocation_status='consumed' for update;
 select * into strict p from public.hr_vacation_periods where id=a.vacation_period_id and tenant_id=r.tenant_id for update;
 if a.allocation_type<>'earned' or a.allocated_days<>r.business_days or p.used_days<a.allocated_days
   or p.certified_opening_balance_id is distinct from r.certified_opening_balance_id or p.available_balance<>r.resulting_balance then raise exception 'holiday_correction_requires_review'; end if;
 if (select count(*) from public.hr_vacation_movements where request_id=r.id and movement_type='aprobacion' and days=-r.business_days)<>1 then raise exception 'holiday_correction_requires_review'; end if;
 select * into strict d from public.hr_vacation_documents where vacation_request_id=r.id and tenant_id=r.tenant_id and document_type='comprobante_feriado' for update;
 if d.file_sha256 is null or d.storage_path is null then raise exception 'previous_document_required'; end if;
 before_r:=to_jsonb(r);before_a:=to_jsonb(a);before_p:=to_jsonb(p);
 total_after:=p.available_balance+delta;
 update public.hr_vacation_periods set used_days=used_days-delta,version=version+1,updated_by=actor.user_id,updated_at=now() where id=p.id;
 update public.hr_vacation_allocations set allocated_days=correct_days,resulting_balance=resulting_balance+delta,
   metadata=coalesce(metadata,'{}')||jsonb_build_object('holiday_correction_original',before_a,'reason',p_reason) where id=a.id;
 insert into public.hr_vacation_movements(tenant_id,employee_id,vacation_period_id,request_id,movement_type,days,previous_balance,resulting_balance,created_by,notes,source,source_reference,effective_date,metadata)
 values(r.tenant_id,r.employee_id,p.id,r.id,'legal_holiday_correction_credit',delta,p.available_balance,total_after,actor.user_id,trim(p_reason),
 'legal_holiday_correction',r.document_number,(now() at time zone 'America/Santiago')::date,jsonb_build_object('allocation_id',a.id,'original_days',r.business_days,'correct_days',correct_days)) returning id into movement;
 insert into public.hr_vacation_holiday_corrections(tenant_id,request_id,employee_id,movement_id,days_returned,old_business_days,new_business_days,balance_before,balance_after,reason,corrected_by,previous_document,before_request,before_allocation,before_period)
 values(r.tenant_id,r.id,r.employee_id,movement,delta,r.business_days,correct_days,p.available_balance,total_after,trim(p_reason),actor.user_id,to_jsonb(d),before_r,before_a,before_p) returning * into c;
 select coalesce(jsonb_agg(jsonb_build_object('allocated_days',allocated_days,'allocation_order',allocation_order,'period_id',vacation_period_id,'previous_balance',previous_balance,'resulting_balance',resulting_balance) order by allocation_order),'[]') into allocations from public.hr_vacation_allocations where request_id=r.id and allocation_status='consumed';
 select coalesce(jsonb_agg(distinct holiday_date),'[]') into legal_dates from public.hr_holiday_calendar where holiday_date between r.start_date and coalesce(r.effective_rest_end_date,r.end_date) and extract(isodow from holiday_date)<6 and scope in ('national','tenant') and status='active' and (tenant_id is null or tenant_id=r.tenant_id);
 snap:=coalesce(r.snapshot,'{}')||jsonb_build_object('allocations',allocations,'holidaysApplied',legal_dates,'calendarStatus','verified','calendarWarnings','[]'::jsonb,'holidayCorrection',jsonb_build_object('id',c.id,'days',delta,'reason',trim(p_reason)));
 snap:=jsonb_set(snap,'{balance}',coalesce(snap->'balance','{}')||jsonb_build_object('after_request',r.resulting_balance+delta));
 snap:=jsonb_set(snap,'{workCalendar}',coalesce(snap->'workCalendar','{}')||jsonb_build_object('non_business',coalesce(snap#>'{workCalendar,non_business}','{}')||jsonb_build_object('daysToDeduct',correct_days,'legalWorkingDays',correct_days,'legalHolidays',jsonb_array_length(legal_dates),'holidays',jsonb_array_length(legal_dates),'holidayDates',legal_dates)));
 update public.hr_vacation_requests set business_days=correct_days,requested_business_days=correct_days,non_business_days=(coalesce(effective_rest_end_date,end_date)-start_date+1)-correct_days,
 resulting_balance=resulting_balance+delta,snapshot=snap,receipt_snapshot=snap,version=version+1,updated_by=actor.user_id,updated_at=now() where id=r.id;
 insert into public.audit_events(tenant_id,company_id,actor_user_id,actor_role,entity_type,entity_id,event_type,before_data,after_data)
 values(r.tenant_id,actor.company_id,actor.user_id,actor.actor_role,'hr_vacation_request',r.id,'hr.vacation_legal_holiday_corrected',jsonb_build_object('request',before_r,'allocation',before_a,'period',before_p,'document',to_jsonb(d)),to_jsonb(c));
 return to_jsonb(c)||jsonb_build_object('already_corrected',false,'applied_days',delta);
end $$;

create or replace function public.hr_complete_vacation_holiday_document(p_correction uuid,p_hash text,p_path text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor record;c public.hr_vacation_holiday_corrections;d public.hr_vacation_documents;
begin
 select * into actor from public.hr_current_vacation_actor();
 if actor.user_id is null then raise exception 'unauthorized'; end if;
 if actor.actor_role::text not in ('owner','admin','finance_manager') then raise exception 'hr_forbidden'; end if;
 select * into strict c from public.hr_vacation_holiday_corrections where id=p_correction and tenant_id=actor.tenant_id for update;
 if c.new_hash is not null then
   if c.new_hash<>p_hash or c.new_path<>p_path then raise exception 'holiday_document_already_completed'; end if;
   return to_jsonb(c);
 end if;
 select * into strict d from public.hr_vacation_documents where id=(c.previous_document->>'id')::uuid and tenant_id=actor.tenant_id;
 if p_hash!~'^[a-f0-9]{64}$' or d.file_sha256<>p_hash or d.storage_path<>p_path or p_path not like '%/corrections/'||c.id::text||'.pdf' then raise exception 'holiday_document_mismatch'; end if;
 update public.hr_vacation_holiday_corrections set new_hash=p_hash,new_path=p_path,document_completed_at=now() where id=c.id returning * into c;
 insert into public.audit_events(tenant_id,company_id,actor_user_id,actor_role,entity_type,entity_id,event_type,before_data,after_data)
 values(c.tenant_id,actor.company_id,actor.user_id,actor.actor_role,'hr_vacation_request',c.request_id,'hr.vacation_holiday_document_corrected',c.previous_document,
 jsonb_build_object('reason',c.reason,'previous_hash',c.previous_document->>'file_sha256','previous_path',c.previous_document->>'storage_path','new_hash',p_hash,'new_path',p_path,'corrected_by',actor.user_id,'corrected_at',now(),'request_id',c.request_id,'receipt_id',c.before_request->>'document_number'));
 return to_jsonb(c);
end $$;
revoke all on function public.hr_correct_vacation_legal_holidays(uuid,integer,text) from public,anon,service_role;
revoke all on function public.hr_complete_vacation_holiday_document(uuid,text,text) from public,anon,service_role;
grant execute on function public.hr_correct_vacation_legal_holidays(uuid,integer,text) to authenticated;
grant execute on function public.hr_complete_vacation_holiday_document(uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
